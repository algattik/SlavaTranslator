#!/usr/bin/env python3

import argparse
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path


SOURCES = {
    "en": "https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl",
    "fr": "https://kaikki.org/frwiktionary/Russe/kaikki.org-dictionary-Russe.jsonl",
    "de": "https://kaikki.org/dewiktionary/Russisch/kaikki.org-dictionary-Russisch.jsonl",
    "ru": "https://kaikki.org/ruwiktionary/Русский/kaikki.org-dictionary-Русский.jsonl",
}

FIELDS = (
    "word",
    "lang",
    "lang_code",
    "pos",
    "senses",
    "forms",
    "sounds",
    "categories",
    "etymology_text",
    "etymology_templates",
    "head_templates",
)


def request(url: str, *, method: str = "GET", byte_range: tuple[int, int] | None = None):
    headers = {"Accept-Encoding": "identity", "User-Agent": "Slava-Spike-S01/1"}
    if byte_range:
        headers["Range"] = f"bytes={byte_range[0]}-{byte_range[1]}"
    encoded_url = urllib.parse.quote(url, safe=":/%?=&")
    return urllib.request.urlopen(
        urllib.request.Request(encoded_url, headers=headers, method=method), timeout=120
    )


def source_metadata(url: str) -> dict:
    with request(url, method="HEAD") as response:
        headers = response.headers
        return {
            "url": response.url,
            "contentLength": int(headers["Content-Length"]),
            "lastModified": headers.get("Last-Modified"),
            "etag": headers.get("ETag"),
            "acceptRanges": headers.get("Accept-Ranges"),
            "contentType": headers.get("Content-Type"),
        }


def has_stress(value) -> bool:
    if isinstance(value, str):
        return "\u0301" in value
    if isinstance(value, list):
        return any(has_stress(item) for item in value)
    if isinstance(value, dict):
        return any(has_stress(item) for item in value.values())
    return False


def has_structured_gloss(record: dict) -> bool:
    senses = record.get("senses")
    if not isinstance(senses, list):
        return False
    for sense in senses:
        if not isinstance(sense, dict):
            continue
        for key in ("glosses", "raw_glosses"):
            values = sense.get(key)
            if isinstance(values, list) and any(
                isinstance(value, str) and value.strip() for value in values
            ):
                return True
    return False


def sample_source(edition: str, url: str, output_dir: Path, window_bytes: int) -> dict:
    metadata = source_metadata(url)
    size = metadata["contentLength"]
    sample_whole_source = size <= window_bytes * 5
    offsets = [0] if sample_whole_source else [
        int(size * fraction) for fraction in (0, 0.2, 0.4, 0.6, 0.8)
    ]
    field_counts = Counter()
    top_level_keys = Counter()
    records = []
    parse_errors = 0
    complete_lines = 0
    russian_records = 0
    structured_gloss_records = 0
    forms_records = 0
    sounds_records = 0
    stress_records = 0
    bytes_downloaded = 0
    windows = []

    for offset in offsets:
        end = size - 1 if sample_whole_source else min(size - 1, offset + window_bytes - 1)
        with request(url, byte_range=(offset, end)) as response:
            data = response.read()
            status = response.status
            content_range = response.headers.get("Content-Range")
        bytes_downloaded += len(data)
        digest = hashlib.sha256(data).hexdigest()
        lines = data.splitlines()
        if offset > 0 and lines:
            lines = lines[1:]
        if end < size - 1 and lines:
            lines = lines[:-1]
        window_valid = 0
        window_errors = 0
        for line in lines:
            if not line.strip():
                continue
            complete_lines += 1
            try:
                record = json.loads(line)
            except (UnicodeDecodeError, json.JSONDecodeError):
                parse_errors += 1
                window_errors += 1
                continue
            if not isinstance(record, dict):
                parse_errors += 1
                window_errors += 1
                continue
            window_valid += 1
            records.append(record)
            top_level_keys.update(record.keys())
            for field in FIELDS:
                value = record.get(field)
                if value not in (None, "", [], {}):
                    field_counts[field] += 1
            russian_records += record.get("lang_code") == "ru"
            structured_gloss_records += has_structured_gloss(record)
            forms_records += isinstance(record.get("forms"), list) and bool(record["forms"])
            sounds_records += isinstance(record.get("sounds"), list) and bool(record["sounds"])
            stress_records += has_stress(record.get("word")) or has_stress(record.get("forms"))
        windows.append(
            {
                "offset": offset,
                "end": end,
                "status": status,
                "contentRange": content_range,
                "bytes": len(data),
                "sha256": digest,
                "completeLines": len(lines),
                "validRecords": window_valid,
                "parseErrors": window_errors,
            }
        )

    sample_path = output_dir / f"{edition}.sample.jsonl"
    with sample_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            handle.write("\n")

    count = len(records)
    return {
        "edition": edition,
        "source": metadata,
        "windows": windows,
        "sample": {
            "path": str(sample_path),
            "sha256": hashlib.sha256(sample_path.read_bytes()).hexdigest(),
            "bytesDownloaded": bytes_downloaded,
            "wholeSource": sample_whole_source,
            "completeLines": complete_lines,
            "validRecords": count,
            "parseErrors": parse_errors,
            "parseRate": count / complete_lines if complete_lines else 0,
            "russianRecords": russian_records,
            "russianPurity": russian_records / count if count else 0,
            "structuredGlossRecords": structured_gloss_records,
            "structuredGlossCoverage": structured_gloss_records / count if count else 0,
            "formsRecords": forms_records,
            "formsCoverage": forms_records / count if count else 0,
            "soundsRecords": sounds_records,
            "soundsCoverage": sounds_records / count if count else 0,
            "stressRecords": stress_records,
            "stressCoverage": stress_records / count if count else 0,
            "fieldCoverage": {
                field: field_counts[field] / count if count else 0 for field in FIELDS
            },
            "topLevelKeys": dict(top_level_keys.most_common()),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--window-mib", type=int, default=2)
    parser.add_argument(
        "--editions",
        nargs="+",
        choices=tuple(SOURCES),
        default=tuple(SOURCES),
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    window_bytes = args.window_mib * 1024 * 1024

    report = {
        "schemaVersion": 1,
        "method": {
            "fractions": [0, 0.2, 0.4, 0.6, 0.8],
            "windowBytes": window_bytes,
            "wholeSourceWhenAtMostFiveWindows": True,
            "partialBoundaryLinesExcluded": True,
        },
        "editions": {},
    }
    for edition in args.editions:
        url = SOURCES[edition]
        print(f"Sampling {edition}: {url}", file=sys.stderr)
        report["editions"][edition] = sample_source(
            edition, url, args.output, window_bytes
        )

    report_path = args.output / "report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
