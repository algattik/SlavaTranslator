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


def stress_positions(value: str) -> tuple[int, ...]:
    positions = []
    position = -1
    for character in unicodedata.normalize("NFD", value):
        if character == "\u0301":
            if position >= 0:
                positions.append(position)
        elif unicodedata.combining(character):
            continue
        else:
            position += 1
            if character.casefold() == "ё":
                positions.append(position)
    return tuple(sorted(set(positions)))


def build_mapping(input_dir: Path):
    mapping = defaultdict(set)
    source_records = 0
    source_forms = 0
    for edition in EDITIONS:
        for line in (input_dir / f"{edition}.jsonl").read_text(
            encoding="utf-8"
        ).splitlines():
            record = json.loads(line)
            source_records += 1
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
                positions = stress_positions(value)
                if positions:
                    mapping[normalize(value)].add(positions)
    canonical = {
        key: tuple(sorted(patterns)) for key, patterns in sorted(mapping.items())
    }
    return canonical, {
        "sourceRecords": source_records,
        "sourceForms": source_forms,
        "stressKeys": len(canonical),
        "ambiguousStressKeys": sum(
            1 for patterns in canonical.values() if len(patterns) > 1
        ),
    }


def output_ids(mapping):
    patterns = sorted(set(mapping.values()))
    return patterns, {pattern: index for index, pattern in enumerate(patterns)}


def canonical_json(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def build_sorted(mapping, pattern_ids, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    keys_blob = bytearray()
    directory = bytearray()
    for key, patterns in mapping.items():
        key_bytes = key.encode("utf-8")
        directory.extend(
            struct.pack(
                "<IHHI",
                len(keys_blob),
                len(key_bytes),
                0,
                pattern_ids[patterns],
            )
        )
        keys_blob.extend(key_bytes)
    (output / "directory.bin").write_bytes(directory)
    (output / "keys.bin").write_bytes(keys_blob)


class State:
    __slots__ = ("transitions", "output_id")

    def __init__(self):
        self.transitions = {}
        self.output_id = None


def build_dawg(mapping, pattern_ids, output: Path):
    root = State()
    previous = b""
    unchecked = []
    registry = {}

    def minimize(down_to: int):
        for position in range(len(unchecked) - 1, down_to - 1, -1):
            parent, label, child = unchecked[position]
            signature = (
                child.output_id,
                tuple(
                    (edge, id(next_state))
                    for edge, next_state in sorted(child.transitions.items())
                ),
            )
            existing = registry.get(signature)
            if existing is None:
                registry[signature] = child
            else:
                parent.transitions[label] = existing
            unchecked.pop()

    for key, patterns in mapping.items():
        word = key.encode("utf-8")
        common = 0
        while (
            common < len(word)
            and common < len(previous)
            and word[common] == previous[common]
        ):
            common += 1
        minimize(common)
        node = root if common == 0 else unchecked[common - 1][2]
        for label in word[common:]:
            child = State()
            node.transitions[label] = child
            unchecked.append((node, label, child))
            node = child
        node.output_id = pattern_ids[patterns]
        previous = word
    minimize(0)

    states = []
    indexes = {id(root): 0}
    queue = [root]
    while queue:
        state = queue.pop(0)
        states.append(state)
        for child in state.transitions.values():
            if id(child) not in indexes:
                indexes[id(child)] = len(indexes)
                queue.append(child)

    nodes = bytearray()
    edges = bytearray()
    edge_cursor = 0
    for state in states:
        transitions = sorted(state.transitions.items())
        nodes.extend(
            struct.pack(
                "<IHHI",
                edge_cursor,
                len(transitions),
                1 if state.output_id is not None else 0,
                state.output_id or 0,
            )
        )
        for label, child in transitions:
            edges.extend(struct.pack("<B3xI", label, indexes[id(child)]))
        edge_cursor += len(transitions)

    output.mkdir(parents=True, exist_ok=True)
    (output / "nodes.bin").write_bytes(nodes)
    (output / "edges.bin").write_bytes(edges)


def read_sorted(path: Path):
    directory = path.joinpath("directory.bin").read_bytes()
    keys = path.joinpath("keys.bin").read_bytes()
    output = {}
    for offset in range(0, len(directory), 12):
        key_offset, key_length, _, output_id = struct.unpack_from(
            "<IHHI", directory, offset
        )
        output[keys[key_offset : key_offset + key_length].decode("utf-8")] = output_id
    return output


def read_dawg(path: Path, keys):
    nodes = path.joinpath("nodes.bin").read_bytes()
    edges = path.joinpath("edges.bin").read_bytes()
    output = {}
    for key in keys:
        state = 0
        for label in key.encode("utf-8"):
            edge_start, edge_count, _, _ = struct.unpack_from(
                "<IHHI", nodes, state * 12
            )
            next_state = None
            for edge_index in range(edge_start, edge_start + edge_count):
                edge_label, candidate = struct.unpack_from(
                    "<B3xI", edges, edge_index * 8
                )
                if edge_label == label:
                    next_state = candidate
                    break
            if next_state is None:
                raise AssertionError(f"missing key {key}")
            state = next_state
        _, _, terminal, output_id = struct.unpack_from("<IHHI", nodes, state * 12)
        if not terminal:
            raise AssertionError(f"non-terminal key {key}")
        output[key] = output_id
    return output


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


def candidate_report(path: Path, archive: Path, scale: float):
    files = sorted(item for item in path.rglob("*") if item.is_file())
    deterministic_zip(path, archive)
    return {
        "files": len(files),
        "installedBytes": sum(item.stat().st_size for item in files),
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

    mapping, counts = build_mapping(args.input)
    patterns, pattern_ids = output_ids(mapping)
    expected = {key: pattern_ids[value] for key, value in mapping.items()}
    patterns_path = args.output / "patterns.json"
    patterns_path.write_bytes(canonical_json(patterns))

    sorted_path = args.output / "sorted"
    dawg_path = args.output / "dawg"
    build_sorted(mapping, pattern_ids, sorted_path)
    build_dawg(mapping, pattern_ids, dawg_path)
    sorted_path.joinpath("patterns.json").write_bytes(patterns_path.read_bytes())
    dawg_path.joinpath("patterns.json").write_bytes(patterns_path.read_bytes())

    if read_sorted(sorted_path) != expected:
        raise AssertionError("sorted table round-trip mismatch")
    if read_dawg(dawg_path, mapping) != expected:
        raise AssertionError("DAWG round-trip mismatch")

    scale = args.estimated_full_records / counts["sourceRecords"]
    report = {
        "schemaVersion": 1,
        "input": {
            **counts,
            "outputPatterns": len(patterns),
            "linearScale": scale,
        },
        "candidates": {
            "sorted-output-ids": candidate_report(
                sorted_path, args.output / "sorted.zip", scale
            ),
            "minimal-dawg-output-ids": candidate_report(
                dawg_path, args.output / "dawg.zip", scale
            ),
        },
        "validation": {
            "keysRoundTripped": len(mapping),
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
