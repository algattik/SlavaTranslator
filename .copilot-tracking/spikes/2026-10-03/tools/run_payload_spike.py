#!/usr/bin/env python3

import argparse
import hashlib
import json
import struct
import zipfile
from collections import Counter
from pathlib import Path


FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
EDITIONS = {"en": 0, "ru": 1, "fr": 2}


def canonical_json(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def deterministic_zip(paths: list[tuple[Path, str]], output: Path) -> None:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in sorted(paths, key=lambda item: item[1]):
            info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def file_report(path: Path) -> dict:
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def build_tuple_json(lemmas: list[dict], results: list[dict], target: Path) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    lemma_tuples = [
        [EDITIONS[item["edition"]], item["word"], item["pos"], item["definitions"]]
        for item in lemmas
    ]
    result_tuples = [
        [item["lemma"], item["display"], list(item["tags"])] for item in results
    ]
    lemma_path = target / "lemmas.json"
    result_path = target / "results.json"
    lemma_path.write_bytes(canonical_json(lemma_tuples))
    result_path.write_bytes(canonical_json(result_tuples))
    decoded_lemmas = [
        {
            "edition": ("en", "ru", "fr")[item[0]],
            "word": item[1],
            "pos": item[2],
            "definitions": item[3],
        }
        for item in json.loads(lemma_path.read_text(encoding="utf-8"))
    ]
    decoded_results = [
        {"lemma": item[0], "display": item[1], "tags": item[2]}
        for item in json.loads(result_path.read_text(encoding="utf-8"))
    ]
    if decoded_lemmas != lemmas or decoded_results != results:
        raise ValueError("Tuple JSON round-trip mismatch")
    return [lemma_path, result_path]


def build_binary(lemmas: list[dict], results: list[dict], target: Path) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    strings = set()
    for item in lemmas:
        strings.update((item["word"], item["pos"], *item["definitions"]))
    for item in results:
        strings.add(item["display"])
        strings.update(item["tags"])
    ordered_strings = sorted(strings)
    string_ids = {value: index for index, value in enumerate(ordered_strings)}

    string_blob = bytearray()
    offsets = bytearray()
    for value in ordered_strings:
        offsets.extend(struct.pack("<I", len(string_blob)))
        string_blob.extend(value.encode("utf-8"))
    offsets.extend(struct.pack("<I", len(string_blob)))

    definitions = bytearray()
    lemma_rows = bytearray()
    for item in lemmas:
        definition_offset = len(definitions) // 4
        for value in item["definitions"]:
            definitions.extend(struct.pack("<I", string_ids[value]))
        lemma_rows.extend(
            struct.pack(
                "<B3xIIII",
                EDITIONS[item["edition"]],
                string_ids[item["word"]],
                string_ids[item["pos"]],
                definition_offset,
                len(item["definitions"]),
            )
        )

    tags = bytearray()
    result_rows = bytearray()
    for item in results:
        tag_offset = len(tags) // 4
        for value in item["tags"]:
            tags.extend(struct.pack("<I", string_ids[value]))
        result_rows.extend(
            struct.pack(
                "<IIII",
                item["lemma"],
                string_ids[item["display"]],
                tag_offset,
                len(item["tags"]),
            )
        )

    files = {
        "strings.bin": bytes(string_blob),
        "string-offsets.bin": bytes(offsets),
        "definitions.bin": bytes(definitions),
        "lemmas.bin": bytes(lemma_rows),
        "tags.bin": bytes(tags),
        "results.bin": bytes(result_rows),
    }
    paths = []
    for name, content in files.items():
        path = target / name
        path.write_bytes(content)
        paths.append(path)

    def get_string(index: int) -> str:
        start = struct.unpack_from("<I", offsets, index * 4)[0]
        end = struct.unpack_from("<I", offsets, (index + 1) * 4)[0]
        return string_blob[start:end].decode("utf-8")

    edition_names = ("en", "ru", "fr")
    decoded_lemmas = []
    for position in range(len(lemmas)):
        edition, word, pos, definition_offset, definition_count = struct.unpack_from(
            "<B3xIIII", lemma_rows, position * 20
        )
        definition_ids = struct.unpack_from(
            f"<{definition_count}I", definitions, definition_offset * 4
        ) if definition_count else ()
        decoded_lemmas.append(
            {
                "edition": edition_names[edition],
                "word": get_string(word),
                "pos": get_string(pos),
                "definitions": [get_string(value) for value in definition_ids],
            }
        )

    decoded_results = []
    for position in range(len(results)):
        lemma, display, tag_offset, tag_count = struct.unpack_from(
            "<IIII", result_rows, position * 16
        )
        tag_ids = struct.unpack_from(
            f"<{tag_count}I", tags, tag_offset * 4
        ) if tag_count else ()
        decoded_results.append(
            {
                "lemma": lemma,
                "display": get_string(display),
                "tags": [get_string(value) for value in tag_ids],
            }
        )
    expected_results = [
        {"lemma": item["lemma"], "display": item["display"], "tags": list(item["tags"])}
        for item in results
    ]
    if decoded_lemmas != lemmas or decoded_results != expected_results:
        raise ValueError("Binary round-trip mismatch")
    return paths


def candidate_report(
    name: str,
    payload_files: list[Path],
    index_files: list[Path],
    output: Path,
    scale: float,
) -> dict:
    archive = output / f"{name}.zip"
    deterministic_zip(
        [(path, f"payload/{path.name}") for path in payload_files]
        + [(path, f"index/{path.name}") for path in index_files],
        archive,
    )
    payload_bytes = sum(path.stat().st_size for path in payload_files)
    installed_bytes = payload_bytes + sum(path.stat().st_size for path in index_files)
    return {
        "payloadFiles": [file_report(path) for path in payload_files],
        "payloadBytes": payload_bytes,
        "installedBytes": installed_bytes,
        "zipBytes": archive.stat().st_size,
        "linearProjectedZipBytes": round(archive.stat().st_size * scale),
        "zipSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--s02", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--estimated-full-records", type=int, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    lemmas = json.loads((args.s02 / "common/lemmas.json").read_text(encoding="utf-8"))
    results = json.loads((args.s02 / "common/results.json").read_text(encoding="utf-8"))
    index_files = sorted((args.s02 / "sorted-table").glob("*.bin"))
    scale = args.estimated_full_records / len(lemmas)

    object_dir = args.output / "object-json"
    object_dir.mkdir(exist_ok=True)
    object_lemmas = object_dir / "lemmas.json"
    object_results = object_dir / "results.json"
    object_lemmas.write_bytes(canonical_json(lemmas))
    object_results.write_bytes(canonical_json(results))

    tuple_files = build_tuple_json(lemmas, results, args.output / "tuple-json")
    binary_files = build_binary(lemmas, results, args.output / "binary")

    definition_stats = {}
    for edition in EDITIONS:
        edition_lemmas = [item for item in lemmas if item["edition"] == edition]
        definitions = [
            definition
            for item in edition_lemmas
            for definition in item["definitions"]
        ]
        definition_stats[edition] = {
            "lemmas": len(edition_lemmas),
            "definitions": len(definitions),
            "definitionCharacters": sum(len(value) for value in definitions),
            "uniqueDefinitions": len(set(definitions)),
        }

    all_strings = []
    for item in lemmas:
        all_strings.extend((item["word"], item["pos"], *item["definitions"]))
    for item in results:
        all_strings.extend((item["display"], *item["tags"]))

    report = {
        "schemaVersion": 1,
        "input": {
            "lemmas": len(lemmas),
            "results": len(results),
            "estimatedFullRecords": args.estimated_full_records,
            "linearScale": scale,
            "definitionStats": definition_stats,
            "stringOccurrences": len(all_strings),
            "uniqueStrings": len(set(all_strings)),
            "uniqueStringRatio": len(set(all_strings)) / len(all_strings),
        },
        "candidates": {
            "object-json": candidate_report(
                "object-json",
                [object_lemmas, object_results],
                index_files,
                args.output,
                scale,
            ),
            "tuple-json": candidate_report(
                "tuple-json", tuple_files, index_files, args.output, scale
            ),
            "binary-string-table": candidate_report(
                "binary-string-table", binary_files, index_files, args.output, scale
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
