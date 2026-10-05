#!/usr/bin/env python3

import argparse
import hashlib
import json
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path


TARGET_EDITIONS = ("fr", "de", "ru")


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_stress = "".join(char for char in decomposed if char != "\u0301")
    return unicodedata.normalize("NFC", without_stress).casefold()


def glosses(record: dict) -> list[str]:
    output = []
    for sense in record.get("senses", []):
        if not isinstance(sense, dict):
            continue
        values = sense.get("glosses") or sense.get("raw_glosses") or []
        output.extend(
            value.strip()
            for value in values
            if isinstance(value, str) and value.strip()
        )
    return output


def load_records(path: Path, edition: str) -> list[dict]:
    records = []
    for source_line, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        record = json.loads(line)
        definitions = glosses(record)
        records.append(
            {
                "edition": edition,
                "sourceLine": source_line,
                "word": record["word"],
                "normalized": normalize(record["word"]),
                "pos": record["pos"],
                "definitions": definitions,
                "definitionCount": len(definitions),
                "etymologyNumber": record.get("etymology_number"),
            }
        )
    return records


def compact_record(record: dict, edition: str, source_line: int) -> dict:
    definitions = glosses(record)
    return {
        "edition": edition,
        "sourceLine": source_line,
        "word": record["word"],
        "normalized": normalize(record["word"]),
        "pos": record["pos"],
        "definitions": definitions,
        "definitionCount": len(definitions),
        "etymologyNumber": record.get("etymology_number"),
    }


def stream_english(url: str, target_words: set[str]):
    encoded_url = urllib.parse.quote(url, safe=":/%?=&")
    request = urllib.request.Request(
        encoded_url,
        headers={"Accept-Encoding": "identity", "User-Agent": "Slava-Spike-S01B/1"},
    )
    records = []
    all_group_keys = set()
    defined_group_keys = set()
    digest = hashlib.sha256()
    bytes_read = 0
    source_records = 0
    with urllib.request.urlopen(request, timeout=120) as response:
        metadata = {
            "url": response.url,
            "contentLength": int(response.headers["Content-Length"]),
            "lastModified": response.headers.get("Last-Modified"),
            "etag": response.headers.get("ETag"),
        }
        for source_line, line in enumerate(response, start=1):
            digest.update(line)
            bytes_read += len(line)
            source_records += 1
            record = json.loads(line)
            compact = compact_record(record, "en", source_line)
            group_key = (compact["normalized"], compact["pos"])
            all_group_keys.add(group_key)
            if compact["definitionCount"]:
                defined_group_keys.add(group_key)
            if compact["normalized"] in target_words:
                records.append(compact)
    metadata.update(
        {
            "bytesRead": bytes_read,
            "sourceRecords": source_records,
            "retainedRecords": len(records),
            "allGroups": len(all_group_keys),
            "definedGroups": len(defined_group_keys),
            "sha256": digest.hexdigest(),
        }
    )
    return records, metadata, all_group_keys, defined_group_keys


def index_records(records: list[dict]):
    exact = defaultdict(list)
    by_word = defaultdict(list)
    for record in records:
        exact[(record["normalized"], record["pos"])].append(record)
        by_word[record["normalized"]].append(record)
    return exact, by_word


def preview(records: list[dict]) -> list[dict]:
    return [
        {
            "edition": record["edition"],
            "sourceLine": record["sourceLine"],
            "word": record["word"],
            "pos": record["pos"],
            "definitionCount": record["definitionCount"],
            "definitionPreview": record["definitions"][:2],
            "etymologyNumber": record["etymologyNumber"],
        }
        for record in records
    ]


def analyze_target(
    target: str,
    target_records: list[dict],
    english_records: list[dict],
    english_all_keys: set[tuple[str, str]],
    english_defined_keys: set[tuple[str, str]],
):
    target_exact, target_words = index_records(target_records)
    english_exact, english_words = index_records(english_records)
    counts = defaultdict(int)
    review_candidates = []

    for key in sorted(target_exact):
        target_group = target_exact[key]
        english_group = english_exact.get(key, [])
        target_has_definitions = any(
            record["definitionCount"] for record in target_group
        )
        english_has_definitions = any(
            record["definitionCount"] for record in english_group
        )
        counts["targetGroups"] += 1
        counts["targetRecords"] += len(target_group)
        counts["targetGroupsWithDefinitions"] += target_has_definitions
        counts["exactEnglishCandidateGroups"] += bool(english_group)
        counts["exactEnglishCandidateRecords"] += len(english_group)
        counts["targetWins"] += target_has_definitions
        counts["englishFallbackEligible"] += (
            not target_has_definitions and english_has_definitions
        )
        counts["noDefinitionInEitherEdition"] += (
            not target_has_definitions and not english_has_definitions
        )
        counts["multipleTargetRecords"] += len(target_group) > 1
        counts["multipleEnglishRecords"] += len(english_group) > 1
        if len(target_group) > 1 or len(english_group) > 1:
            review_candidates.append(
                {
                    "category": "multiple-record exact-key group",
                    "key": {"normalized": key[0], "pos": key[1]},
                    "target": preview(target_group),
                    "english": preview(english_group),
                }
            )

    for normalized in sorted(target_words):
        if normalized not in english_words:
            counts["targetWordsWithoutEnglishWordCandidate"] += 1
            continue
        target_parts = {record["pos"] for record in target_words[normalized]}
        english_parts = {record["pos"] for record in english_words[normalized]}
        if target_parts.isdisjoint(english_parts):
            counts["wordMatchesWithOnlyPosMismatch"] += 1
            review_candidates.append(
                {
                    "category": "word match with part-of-speech mismatch",
                    "key": {"normalized": normalized},
                    "target": preview(target_words[normalized]),
                    "english": preview(english_words[normalized]),
                }
            )

    ordered_review = sorted(
        review_candidates,
        key=lambda value: (
            value["category"],
            value["key"]["normalized"],
            value["key"].get("pos", ""),
        ),
    )
    target_defined_keys = {
        key
        for key, group in target_exact.items()
        if any(record["definitionCount"] for record in group)
    }
    target_coverage_keys = target_defined_keys & english_all_keys
    fallback_keys = english_defined_keys - target_defined_keys
    return {
        "counts": dict(sorted(counts.items())),
        "englishBaseline": {
            "groups": len(english_all_keys),
            "definedGroups": len(english_defined_keys),
            "groupsWithTargetDefinitions": len(target_coverage_keys),
            "groupsUsingEnglishFallback": len(fallback_keys),
            "targetCoverageOfEnglishGroups": (
                len(target_coverage_keys) / len(english_all_keys)
                if english_all_keys
                else 0
            ),
        },
        "reviewCandidates": ordered_review[:100],
        "reviewCandidateCount": len(ordered_review),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    english_source = parser.add_mutually_exclusive_group(required=True)
    english_source.add_argument("--english", type=Path)
    english_source.add_argument("--english-url")
    parser.add_argument("--french", type=Path, required=True)
    parser.add_argument("--german", type=Path, required=True)
    parser.add_argument("--russian", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    inputs = {
        "fr": args.french,
        "de": args.german,
        "ru": args.russian,
    }
    records = {
        edition: load_records(path, edition) for edition, path in inputs.items()
    }
    if args.english_url:
        target_words = {
            record["normalized"]
            for edition_records in records.values()
            for record in edition_records
        }
        english_records, english_metadata, english_all_keys, english_defined_keys = stream_english(
            args.english_url, target_words
        )
        english_input = english_metadata
    else:
        english_records = load_records(args.english, "en")
        english_all_keys = {
            (record["normalized"], record["pos"]) for record in english_records
        }
        english_defined_keys = {
            (record["normalized"], record["pos"])
            for record in english_records
            if record["definitionCount"]
        }
        english_input = {
            "path": str(args.english),
            "bytes": args.english.stat().st_size,
            "sha256": hashlib.sha256(args.english.read_bytes()).hexdigest(),
            "records": len(english_records),
        }
    records["en"] = english_records
    report = {
        "schemaVersion": 1,
        "contract": {
            "groupKey": ["normalizedHeadword", "partOfSpeech"],
            "fallbackScope": "lemma-group",
            "senseEquivalenceClaimed": False,
            "ambiguousChildrenPreserved": True,
        },
        "inputs": {
            "en": english_input,
            **{
            edition: {
                "path": str(path),
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "records": len(records[edition]),
            }
            for edition, path in inputs.items()
            },
        },
        "targets": {
            edition: analyze_target(
                edition,
                records[edition],
                records["en"],
                english_all_keys,
                english_defined_keys,
            )
            for edition in TARGET_EDITIONS
        },
        "limitations": [
            "French and Russian inputs are deterministic 2,000-record samples rather than complete editions.",
            "German input is the complete current 3,771-record edition.",
            "When english-url is used, the complete English edition is streamed and only records matching target-corpus headwords are retained.",
            "Automated grouping does not prove sense-level equivalence; review candidates remain required golden-corpus inputs.",
        ],
    }
    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.output / "report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
