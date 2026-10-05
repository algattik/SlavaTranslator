#!/usr/bin/env python3

import argparse
import hashlib
import json
import struct
import time
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path


EDITIONS = ("en", "fr", "de", "ru")
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
ACCENTED_LABELS = {
    129,
    131,
    140,
    144,
    154,
    156,
    157,
    158,
    159,
    161,
    165,
    178,
    179,
    186,
    188,
    189,
    190,
    191,
}


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


def build_expected(input_dir: Path):
    mapping = defaultdict(set)
    for edition in EDITIONS:
        for line in (input_dir / f"{edition}.jsonl").read_text(
            encoding="utf-8"
        ).splitlines():
            record = json.loads(line)
            values = [record["word"]]
            values.extend(
                form["form"]
                for form in record.get("forms", [])
                if isinstance(form, dict)
                and isinstance(form.get("form"), str)
                and form["form"].strip()
            )
            for value in values:
                positions = stress_positions(value)
                if positions:
                    mapping[normalize(value)].add(positions)
    return {
        key: tuple(sorted(patterns)) for key, patterns in sorted(mapping.items())
    }


def input_code(character: str):
    value = ord(character)
    if value == 1025:
        return 168
    if value == 1105:
        return 184
    if 1040 <= value < 1104:
        return value - 848
    return None


def base_label(label: int):
    replacements = {
        129: 224,
        131: 229,
        140: 232,
        144: 224,
        154: 229,
        156: 238,
        157: 232,
        158: 238,
        159: 243,
        161: 243,
        165: 251,
        178: 251,
        179: 253,
        184: 229,
        186: 254,
        188: 253,
        189: 254,
        190: 255,
        191: 255,
    }
    return replacements.get(label, label)


class Fsa:
    def __init__(self, path: Path):
        data = path.read_bytes()
        if len(data) % 4:
            raise ValueError("dictionary byte length is not divisible by four")
        self.data = data
        self.values = struct.unpack(f"<{len(data) // 4}I", data)

    def node(self, start: int):
        if start >= len(self.values):
            raise ValueError(f"node offset outside dictionary: {start}")
        index = start
        while index < len(self.values):
            edge = self.values[index]
            yield edge
            index += 1
            if edge & 2:
                return
        raise ValueError(f"unterminated node at offset {start}")

    def lookup(self, word: str):
        normalized = normalize(word)
        results = []

        def visit(node_offset: int, position: int, stresses: tuple[int, ...]):
            expected = input_code(normalized[position])
            if expected is None:
                return
            for edge in self.node(node_offset):
                label = edge >> 24
                if base_label(label) != expected:
                    continue
                next_stresses = stresses
                if label in ACCENTED_LABELS or label == 184:
                    next_stresses = stresses + (position,)
                target = (edge & 0xFFFFFF) >> 2
                if position == len(normalized) - 1:
                    if edge & 1:
                        results.append(tuple(sorted(set(next_stresses))))
                elif target < len(self.values):
                    visit(target, position + 1, next_stresses)

        if normalized:
            visit(0, 0, ())
        return tuple(sorted(set(results)))


def deterministic_zip(source: Path, output: Path):
    with zipfile.ZipFile(
        output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        info = zipfile.ZipInfo("dictionary", FIXED_ZIP_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, source.read_bytes())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--license", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    expected = build_expected(args.input)
    fsa = Fsa(args.dictionary)
    started = time.perf_counter()
    hits = 0
    exact = 0
    conflicts = 0
    missing = 0
    examples = []
    for key, patterns in expected.items():
        actual = fsa.lookup(key)
        if actual:
            hits += 1
            if actual == patterns:
                exact += 1
            else:
                conflicts += 1
                if len(examples) < 100:
                    examples.append(
                        {"key": key, "kaikki": patterns, "dedicated": actual}
                    )
        else:
            missing += 1
    elapsed = time.perf_counter() - started

    archive = args.output / "dictionary.zip"
    deterministic_zip(args.dictionary, archive)
    license_text = args.license.read_text(encoding="utf-8")
    report = {
        "schemaVersion": 1,
        "source": {
            "revision": args.source_revision,
            "dictionaryBytes": args.dictionary.stat().st_size,
            "dictionarySha256": hashlib.sha256(
                args.dictionary.read_bytes()
            ).hexdigest(),
            "license": "MIT" if "MIT License" in license_text else "unknown",
            "zipBytes": archive.stat().st_size,
            "zipSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        },
        "compatibility": {
            "sampleKeys": len(expected),
            "hits": hits,
            "exactPatternMatches": exact,
            "conflictingPatterns": conflicts,
            "missing": missing,
            "hitCoverage": hits / len(expected),
            "exactCoverage": exact / len(expected),
            "conflictExamples": examples,
        },
        "benchmark": {
            "lookups": len(expected),
            "elapsedSeconds": elapsed,
            "meanMicroseconds": elapsed * 1_000_000 / len(expected),
        },
        "validation": {
            "byteLengthDivisibleByFour": True,
            "lookupsCompleted": len(expected),
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
