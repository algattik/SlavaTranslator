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
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_stress = "".join(char for char in decomposed if char != "\u0301")
    return unicodedata.normalize("NFC", without_stress).casefold()


def common_prefix(values: list[str]) -> str:
    if not values:
        return ""
    prefix = values[0]
    for value in values[1:]:
        limit = min(len(prefix), len(value))
        position = 0
        while position < limit and prefix[position] == value[position]:
            position += 1
        prefix = prefix[:position]
        if not prefix:
            break
    return prefix


def is_russian_surface(value: str) -> bool:
    if not value or any(character.isspace() for character in value):
        return False
    has_cyrillic = False
    for character in value:
        if character in "-‑'’":
            continue
        name = unicodedata.name(character, "")
        if "CYRILLIC" not in name:
            return False
        has_cyrillic = True
    return has_cyrillic


def canonical_json(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def build_groups(input_dir: Path):
    groups = {}
    source_records = 0
    source_forms = 0
    excluded_headwords = 0
    excluded_forms = 0
    for edition in EDITIONS:
        for line in (input_dir / f"{edition}.jsonl").read_text(
            encoding="utf-8"
        ).splitlines():
            record = json.loads(line)
            source_records += 1
            headword = normalize(record["word"])
            if not is_russian_surface(headword):
                excluded_headwords += 1
                continue
            key = (headword, record["pos"])
            group = groups.setdefault(
                key,
                {
                    "headword": key[0],
                    "pos": record["pos"],
                    "forms": set(),
                },
            )
            group["forms"].add(key[0])
            for form in record.get("forms", []):
                if not isinstance(form, dict):
                    continue
                value = form.get("form")
                if not isinstance(value, str) or not value.strip():
                    continue
                normalized = normalize(value)
                if is_russian_surface(normalized):
                    group["forms"].add(normalized)
                    source_forms += 1
                else:
                    excluded_forms += 1

    ordered = []
    flat = defaultdict(set)
    for group_id, key in enumerate(sorted(groups)):
        group = groups[key]
        forms = tuple(sorted(group["forms"]))
        ordered.append(
            {
                "groupId": group_id,
                "headword": group["headword"],
                "pos": group["pos"],
                "forms": forms,
            }
        )
        for form in forms:
            flat[form].add(group_id)
    return ordered, {
        key: tuple(sorted(values)) for key, values in sorted(flat.items())
    }, {
        "sourceRecords": source_records,
        "sourceForms": source_forms,
        "excludedHeadwords": excluded_headwords,
        "excludedForms": excluded_forms,
        "groups": len(ordered),
        "surfaceKeys": len(flat),
        "ambiguousSurfaceKeys": sum(1 for values in flat.values() if len(values) > 1),
    }


def build_table(mapping: dict[str, tuple[int, ...]], target: Path):
    target.mkdir(parents=True, exist_ok=True)
    keys = bytearray()
    postings = bytearray()
    directory = bytearray()
    for key, values in mapping.items():
        key_bytes = key.encode("utf-8")
        key_offset = len(keys)
        keys.extend(key_bytes)
        posting_offset = len(postings) // 4
        for value in values:
            postings.extend(struct.pack("<I", value))
        directory.extend(
            struct.pack(
                "<IHHII",
                key_offset,
                len(key_bytes),
                0,
                posting_offset,
                len(values),
            )
        )
    (target / "directory.bin").write_bytes(directory)
    (target / "keys.bin").write_bytes(keys)
    (target / "postings.bin").write_bytes(postings)


def deterministic_zip(source: Path, output: Path):
    with zipfile.ZipFile(
        output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for path in sorted(source.rglob("*")):
            if not path.is_file():
                continue
            info = zipfile.ZipInfo(str(path.relative_to(source)), FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def package_report(source: Path, archive: Path, scale: float):
    files = sorted(path for path in source.rglob("*") if path.is_file())
    deterministic_zip(source, archive)
    return {
        "files": len(files),
        "installedBytes": sum(path.stat().st_size for path in files),
        "zipBytes": archive.stat().st_size,
        "linearProjectedZipBytes": round(archive.stat().st_size * scale),
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    }


def build_candidate(groups, expected, minimum_stem_length: int, output: Path):
    paradigms = {}
    paradigm_rows = []
    stem_descriptors = []
    stem_index = defaultdict(list)
    exceptions = defaultdict(set)
    encoded_groups = 0
    exception_groups = 0

    for group in groups:
        forms = list(group["forms"])
        stem = common_prefix(forms)
        suffixes = tuple(form[len(stem) :] for form in forms)
        if len(stem) < minimum_stem_length or len(forms) < 2:
            exception_groups += 1
            for form in forms:
                exceptions[form].add(group["groupId"])
            continue
        paradigm_id = paradigms.get(suffixes)
        if paradigm_id is None:
            paradigm_id = len(paradigm_rows)
            paradigms[suffixes] = paradigm_id
            paradigm_rows.append(suffixes)
        descriptor_id = len(stem_descriptors)
        stem_descriptors.append((paradigm_id, group["groupId"]))
        stem_index[stem].append(descriptor_id)
        encoded_groups += 1

    reconstructed = defaultdict(set)
    for stem, descriptor_ids in stem_index.items():
        for descriptor_id in descriptor_ids:
            paradigm_id, group_id = stem_descriptors[descriptor_id]
            for suffix in paradigm_rows[paradigm_id]:
                reconstructed[stem + suffix].add(group_id)
    for form, group_ids in exceptions.items():
        reconstructed[form].update(group_ids)
    canonical_reconstructed = {
        key: tuple(sorted(values))
        for key, values in sorted(reconstructed.items())
    }
    if canonical_reconstructed != expected:
        missing = set(expected.items()) - set(canonical_reconstructed.items())
        unexpected = set(canonical_reconstructed.items()) - set(expected.items())
        raise AssertionError(
            f"candidate mismatch: missing={len(missing)} unexpected={len(unexpected)}"
        )

    output.mkdir(parents=True, exist_ok=True)
    build_table(
        {
            key: tuple(values)
            for key, values in sorted(stem_index.items())
        },
        output / "stem-index",
    )
    descriptor_blob = bytearray()
    for paradigm_id, group_id in stem_descriptors:
        descriptor_blob.extend(struct.pack("<II", paradigm_id, group_id))
    (output / "descriptors.bin").write_bytes(descriptor_blob)
    (output / "paradigms.json").write_bytes(canonical_json(paradigm_rows))
    build_table(
        {
            key: tuple(sorted(values))
            for key, values in sorted(exceptions.items())
        },
        output / "exceptions",
    )

    reused_paradigms = len(stem_descriptors) - len(paradigm_rows)
    return {
        "minimumStemLength": minimum_stem_length,
        "encodedGroups": encoded_groups,
        "exceptionGroups": exception_groups,
        "descriptors": len(stem_descriptors),
        "uniqueParadigms": len(paradigm_rows),
        "reusedParadigms": reused_paradigms,
        "semanticMismatches": 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--estimated-full-records", type=int, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    groups, flat, counts = build_groups(args.input)
    scale = args.estimated_full_records / counts["sourceRecords"]

    baseline_path = args.output / "flat"
    build_table(flat, baseline_path)
    candidates = {}
    for minimum_stem_length in (1, 2, 3, 4):
        name = f"stem-{minimum_stem_length}"
        path = args.output / name
        metrics = build_candidate(
            groups, flat, minimum_stem_length, path
        )
        metrics["package"] = package_report(
            path, args.output / f"{name}.zip", scale
        )
        candidates[name] = metrics

    report = {
        "schemaVersion": 1,
        "input": {**counts, "linearScale": scale},
        "baseline": package_report(
            baseline_path, args.output / "flat.zip", scale
        ),
        "candidates": candidates,
        "validation": {
            "surfaceKeys": len(flat),
            "semanticMismatches": 0,
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
