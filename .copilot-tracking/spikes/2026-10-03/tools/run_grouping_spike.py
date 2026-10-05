#!/usr/bin/env python3

import argparse
import hashlib
import json
import struct
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path


EDITIONS = ("en", "ru", "fr")
EDITION_IDS = {value: index for index, value in enumerate(EDITIONS)}
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


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


def canonical_json(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def build_grouped(input_dir: Path):
    groups = {}
    source_records = 0
    source_definitions = 0
    source_forms = 0

    for edition in EDITIONS:
        for line in (input_dir / f"{edition}.jsonl").read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            source_records += 1
            definitions = glosses(record)
            source_definitions += len(definitions)
            key = (normalize(record["word"]), record["pos"])
            group = groups.setdefault(
                key,
                {
                    "key": key[0],
                    "pos": record["pos"],
                    "entries": [],
                    "forms": set(),
                },
            )
            group["entries"].append(
                (
                    EDITION_IDS[edition],
                    record["word"],
                    tuple(definitions),
                )
            )
            group["forms"].add((record["word"], ()))
            for form in record.get("forms", []):
                if not isinstance(form, dict):
                    continue
                value = form.get("form")
                if not isinstance(value, str) or not value.strip():
                    continue
                tags = tuple(
                    sorted(
                        tag
                        for tag in form.get("tags", [])
                        if isinstance(tag, str) and tag
                    )
                )
                group["forms"].add((value, tags))
                source_forms += 1

    ordered = [groups[key] for key in sorted(groups)]
    return ordered, {
        "sourceRecords": source_records,
        "sourceDefinitions": source_definitions,
        "sourceForms": source_forms,
    }


def materialize(groups: list[dict], scope: str):
    group_rows = []
    result_rows = []
    index = defaultdict(list)
    emitted_entries = 0
    emitted_definitions = 0

    for group_id, group in enumerate(groups):
        entries = []
        for edition, word, definitions in group["entries"]:
            selected = definitions
            if scope == "english-definitions" and edition != EDITION_IDS["en"]:
                selected = ()
            elif scope == "stress-only":
                selected = ()
            entries.append([edition, word, list(selected)])
            emitted_entries += 1
            emitted_definitions += len(selected)
        if scope == "stress-only":
            group_rows.append([group["key"], group["pos"]])
        else:
            group_rows.append([group["key"], group["pos"], entries])

        for display, tags in sorted(group["forms"]):
            result_id = len(result_rows)
            result_rows.append([group_id, display, list(tags)])
            index[normalize(display)].append(result_id)

    return group_rows, result_rows, {
        key: sorted(values) for key, values in sorted(index.items())
    }, {
        "groups": len(group_rows),
        "entries": emitted_entries,
        "definitions": emitted_definitions,
        "results": len(result_rows),
        "keys": len(index),
        "ambiguousKeys": sum(1 for values in index.values() if len(values) > 1),
    }


def build_sorted_index(index: dict[str, list[int]], target: Path) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    keys_blob = bytearray()
    postings_blob = bytearray()
    directory = bytearray()
    for key, values in index.items():
        key_bytes = key.encode("utf-8")
        key_offset = len(keys_blob)
        keys_blob.extend(key_bytes)
        post_offset = len(postings_blob) // 4
        for value in values:
            postings_blob.extend(struct.pack("<I", value))
        directory.extend(
            struct.pack("<IHHII", key_offset, len(key_bytes), 0, post_offset, len(values))
        )
    files = {
        "directory.bin": directory,
        "keys.bin": keys_blob,
        "postings.bin": postings_blob,
    }
    paths = []
    for name, content in files.items():
        path = target / name
        path.write_bytes(content)
        paths.append(path)
    return paths


def deterministic_zip(paths: list[tuple[Path, str]], output: Path) -> None:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in sorted(paths, key=lambda item: item[1]):
            info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def run_scope(groups, source_counts, scope: str, target: Path, scale: float) -> dict:
    target.mkdir(parents=True, exist_ok=True)
    group_rows, result_rows, index, counts = materialize(groups, scope)
    groups_path = target / "groups.json"
    results_path = target / "results.json"
    groups_path.write_bytes(canonical_json(group_rows))
    results_path.write_bytes(canonical_json(result_rows))
    index_files = build_sorted_index(index, target / "index")
    archive = target.parent / f"{scope}.zip"
    deterministic_zip(
        [(groups_path, "payload/groups.json"), (results_path, "payload/results.json")]
        + [(path, f"index/{path.name}") for path in index_files],
        archive,
    )
    installed = groups_path.stat().st_size + results_path.stat().st_size + sum(
        path.stat().st_size for path in index_files
    )
    return {
        "sourceCounts": source_counts,
        "emittedCounts": counts,
        "installedBytes": installed,
        "zipBytes": archive.stat().st_size,
        "linearProjectedZipBytes": round(archive.stat().st_size * scale),
        "zipSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--estimated-full-records", type=int, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    groups, source_counts = build_grouped(args.input)
    scale = args.estimated_full_records / source_counts["sourceRecords"]
    report = {
        "schemaVersion": 1,
        "input": {
            **source_counts,
            "groups": len(groups),
            "groupsWithMultipleEntries": sum(
                1 for group in groups if len(group["entries"]) > 1
            ),
            "linearScale": scale,
        },
        "scopes": {
            scope: run_scope(
                groups, source_counts, scope, args.output / scope, scale
            )
            for scope in ("all-definitions", "english-definitions", "stress-only")
        },
    }
    report_path = args.output / "report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
