#!/usr/bin/env python3

import argparse
import hashlib
import json
import struct
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path


EDITIONS = ("en", "fr", "de", "ru")
EDITION_IDS = {value: index for index, value in enumerate(EDITIONS)}
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_stress = "".join(char for char in decomposed if char != "\u0301")
    return unicodedata.normalize("NFC", without_stress).casefold()


def stressed(value: str) -> bool:
    return "\u0301" in unicodedata.normalize("NFD", value) or "ё" in value.casefold()


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


def build_model(input_dir: Path):
    groups = {}
    surfaces = defaultdict(lambda: {"stress": set(), "groups": set()})
    source_records = 0
    source_forms = 0

    for edition in EDITIONS:
        for line in (input_dir / f"{edition}.jsonl").read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            source_records += 1
            group_key = (normalize(record["word"]), record["pos"])
            group = groups.setdefault(
                group_key,
                {
                    "key": group_key[0],
                    "pos": record["pos"],
                    "entries": [],
                },
            )
            group["entries"].append(
                [
                    EDITION_IDS[edition],
                    record["word"],
                    glosses(record),
                ]
            )
            values = [record["word"]]
            values.extend(
                form["form"]
                for form in record.get("forms", [])
                if isinstance(form, dict)
                and isinstance(form.get("form"), str)
                and form["form"].strip()
            )
            source_forms += max(0, len(values) - 1)
            for value in values:
                key = normalize(value)
                if not key:
                    continue
                surfaces[key]["groups"].add(group_key)
                if stressed(value):
                    surfaces[key]["stress"].add(value)

    ordered_keys = sorted(groups)
    group_ids = {key: index for index, key in enumerate(ordered_keys)}
    group_rows = [
        [groups[key]["key"], groups[key]["pos"], groups[key]["entries"]]
        for key in ordered_keys
    ]
    stress_map = {
        key: sorted(value["stress"])
        for key, value in sorted(surfaces.items())
        if value["stress"]
    }
    lemma_map = {
        key: sorted(group_ids[group] for group in value["groups"])
        for key, value in sorted(surfaces.items())
    }
    return group_rows, stress_map, lemma_map, {
        "sourceRecords": source_records,
        "sourceForms": source_forms,
        "groups": len(group_rows),
        "surfaceKeys": len(surfaces),
    }


def build_table(mapping: dict[str, list[int]], target: Path) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    keys = bytearray()
    postings = bytearray()
    directory = bytearray()
    for key, values in mapping.items():
        key_bytes = key.encode("utf-8")
        key_offset = len(keys)
        keys.extend(key_bytes)
        post_offset = len(postings) // 4
        for value in values:
            postings.extend(struct.pack("<I", value))
        directory.extend(
            struct.pack("<IHHII", key_offset, len(key_bytes), 0, post_offset, len(values))
        )
    files = {
        "directory.bin": directory,
        "keys.bin": keys,
        "postings.bin": postings,
    }
    output = []
    for name, content in files.items():
        path = target / name
        path.write_bytes(content)
        output.append(path)
    return output


def deterministic_zip(paths: list[tuple[Path, str]], output: Path) -> None:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in sorted(paths, key=lambda item: item[1]):
            info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def package_report(paths: list[tuple[Path, str]], archive: Path, scale: float) -> dict:
    deterministic_zip(paths, archive)
    installed = sum(path.stat().st_size for path, _ in paths)
    return {
        "files": len(paths),
        "installedBytes": installed,
        "zipBytes": archive.stat().st_size,
        "linearProjectedZipBytes": round(archive.stat().st_size * scale),
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--estimated-full-records", type=int, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    groups, stress_map, lemma_map, counts = build_model(args.input)
    scale = args.estimated_full_records / counts["sourceRecords"]

    group_path = args.output / "groups.json"
    group_path.write_bytes(canonical_json(groups))

    stress_strings = sorted(
        {display for displays in stress_map.values() for display in displays}
    )
    stress_ids = {value: index for index, value in enumerate(stress_strings)}
    stress_string_path = args.output / "stress-strings.json"
    stress_string_path.write_bytes(canonical_json(stress_strings))
    stress_table = build_table(
        {
            key: [stress_ids[value] for value in displays]
            for key, displays in stress_map.items()
        },
        args.output / "stress-index",
    )
    lemma_table = build_table(lemma_map, args.output / "lemma-index")

    stress_paths = [(stress_string_path, "stress/strings.json")] + [
        (path, f"stress/index/{path.name}") for path in stress_table
    ]
    definition_paths = [(group_path, "definitions/groups.json")] + [
        (path, f"definitions/index/{path.name}") for path in lemma_table
    ]

    report = {
        "schemaVersion": 1,
        "input": {**counts, "linearScale": scale},
        "coverage": {
            "stressKeys": len(stress_map),
            "stressVariants": len(stress_strings),
            "ambiguousStressKeys": sum(
                1 for values in stress_map.values() if len(values) > 1
            ),
            "lemmaKeys": len(lemma_map),
            "ambiguousLemmaKeys": sum(
                1 for values in lemma_map.values() if len(values) > 1
            ),
            "stressKeyCoverage": len(stress_map) / len(lemma_map),
        },
        "packages": {
            "stress": package_report(
                stress_paths, args.output / "stress.zip", scale
            ),
            "definitions": package_report(
                definition_paths, args.output / "definitions.zip", scale
            ),
            "combined": package_report(
                stress_paths + definition_paths,
                args.output / "combined.zip",
                scale,
            ),
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
