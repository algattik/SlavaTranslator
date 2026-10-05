#!/usr/bin/env python3

import argparse
import hashlib
import json
import math
import random
import statistics
import struct
import time
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path


EDITIONS = ("en", "ru", "fr")
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_stress = "".join(char for char in decomposed if char != "\u0301")
    return unicodedata.normalize("NFC", without_stress).casefold()


def sense_glosses(record: dict) -> list[str]:
    values = []
    for sense in record.get("senses", []):
        if not isinstance(sense, dict):
            continue
        glosses = sense.get("glosses") or sense.get("raw_glosses") or []
        for gloss in glosses:
            if isinstance(gloss, str) and gloss.strip():
                values.append(gloss.strip())
    return values


def build_semantic_model(input_dir: Path) -> tuple[list[dict], list[dict], dict[str, list[int]]]:
    lemmas = []
    results = []
    index = defaultdict(list)
    result_identity = {}

    for edition in EDITIONS:
        source = input_dir / f"{edition}.jsonl"
        for line in source.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            lemma_id = len(lemmas)
            lemmas.append(
                {
                    "edition": edition,
                    "word": record["word"],
                    "pos": record["pos"],
                    "definitions": sense_glosses(record),
                }
            )
            surfaces = [(record["word"], ())]
            for form in record.get("forms", []):
                if not isinstance(form, dict):
                    continue
                text = form.get("form")
                if not isinstance(text, str) or not text.strip():
                    continue
                tags = tuple(
                    sorted(
                        tag
                        for tag in form.get("tags", [])
                        if isinstance(tag, str) and tag
                    )
                )
                surfaces.append((text, tags))
            for display, tags in surfaces:
                key = normalize(display)
                if not key:
                    continue
                identity = (lemma_id, display, tags)
                result_id = result_identity.get(identity)
                if result_id is None:
                    result_id = len(results)
                    result_identity[identity] = result_id
                    results.append(
                        {
                            "lemma": lemma_id,
                            "display": display,
                            "tags": tags,
                        }
                    )
                if result_id not in index[key]:
                    index[key].append(result_id)

    canonical_index = {key: sorted(values) for key, values in sorted(index.items())}
    return lemmas, results, canonical_index


def canonical_json(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def shard_name(key: str) -> str:
    prefix = key[:2].encode("utf-8")
    return prefix.hex() or "empty"


def build_json_shards(index: dict[str, list[int]], target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    shards = defaultdict(list)
    for key, values in index.items():
        shards[shard_name(key)].append([key, values])
    manifest = {}
    for name, entries in sorted(shards.items()):
        path = target / f"{name}.json"
        path.write_bytes(canonical_json(entries))
        manifest[name] = len(entries)
    (target / "manifest.json").write_bytes(canonical_json(manifest))


def build_sorted_table(index: dict[str, list[int]], target: Path) -> None:
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
    (target / "directory.bin").write_bytes(directory)
    (target / "keys.bin").write_bytes(keys_blob)
    (target / "postings.bin").write_bytes(postings_blob)


class State:
    __slots__ = ("transitions", "postings")

    def __init__(self):
        self.transitions = {}
        self.postings = None


def build_minimal_dawg(index: dict[str, list[int]], target: Path) -> None:
    root = State()
    previous = b""
    unchecked = []
    registry = {}

    def minimize(down_to: int) -> None:
        for position in range(len(unchecked) - 1, down_to - 1, -1):
            parent, label, child = unchecked[position]
            signature = (
                tuple(child.postings or ()),
                tuple((edge, id(next_state)) for edge, next_state in sorted(child.transitions.items())),
            )
            existing = registry.get(signature)
            if existing is None:
                registry[signature] = child
            else:
                parent.transitions[label] = existing
            unchecked.pop()

    for key, values in index.items():
        word = key.encode("utf-8")
        common = 0
        limit = min(len(word), len(previous))
        while common < limit and word[common] == previous[common]:
            common += 1
        minimize(common)
        node = root if common == 0 else unchecked[common - 1][2]
        for label in word[common:]:
            child = State()
            node.transitions[label] = child
            unchecked.append((node, label, child))
            node = child
        node.postings = tuple(values)
        previous = word
    minimize(0)

    states = []
    state_index = {id(root): 0}
    queue = [root]
    while queue:
        state = queue.pop(0)
        states.append(state)
        for _, child in sorted(state.transitions.items()):
            if id(child) not in state_index:
                state_index[id(child)] = len(state_index)
                queue.append(child)

    nodes_blob = bytearray()
    edges_blob = bytearray()
    postings_blob = bytearray()
    edge_cursor = 0
    for state in states:
        transitions = sorted(state.transitions.items())
        post_offset = len(postings_blob) // 4
        postings = state.postings or ()
        for value in postings:
            postings_blob.extend(struct.pack("<I", value))
        nodes_blob.extend(
            struct.pack(
                "<IHHII",
                edge_cursor,
                len(transitions),
                1 if state.postings is not None else 0,
                post_offset,
                len(postings),
            )
        )
        for label, child in transitions:
            edges_blob.extend(
                struct.pack("<B3xI", label, state_index[id(child)])
            )
        edge_cursor += len(transitions)

    target.mkdir(parents=True, exist_ok=True)
    (target / "nodes.bin").write_bytes(nodes_blob)
    (target / "edges.bin").write_bytes(edges_blob)
    (target / "postings.bin").write_bytes(postings_blob)


def deterministic_zip(source_dirs: list[Path], output: Path) -> None:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        files = []
        for source in source_dirs:
            files.extend(path for path in source.rglob("*") if path.is_file())
        for path in sorted(files, key=lambda item: str(item)):
            root = next(source for source in source_dirs if path.is_relative_to(source))
            name = f"{root.name}/{path.relative_to(root)}"
            info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def directory_stats(path: Path) -> dict:
    files = sorted(item for item in path.rglob("*") if item.is_file())
    return {
        "files": len(files),
        "bytes": sum(item.stat().st_size for item in files),
        "largestFileBytes": max((item.stat().st_size for item in files), default=0),
        "sha256": {
            str(item.relative_to(path)): hashlib.sha256(item.read_bytes()).hexdigest()
            for item in files
        },
    }


class JsonShardReader:
    def __init__(self, path: Path):
        self.path = path
        self.cache = {}

    def lookup(self, key: str):
        name = shard_name(key)
        entries = self.cache.get(name)
        if entries is None:
            source = self.path / f"{name}.json"
            if not source.exists():
                self.cache[name] = []
                return []
            entries = json.loads(source.read_text(encoding="utf-8"))
            self.cache[name] = entries
        low, high = 0, len(entries)
        while low < high:
            middle = (low + high) // 2
            candidate = entries[middle][0]
            if candidate < key:
                low = middle + 1
            else:
                high = middle
        return entries[low][1] if low < len(entries) and entries[low][0] == key else []


class SortedTableReader:
    RECORD_SIZE = 16

    def __init__(self, path: Path):
        self.directory = (path / "directory.bin").read_bytes()
        self.keys = (path / "keys.bin").read_bytes()
        self.postings = (path / "postings.bin").read_bytes()
        self.count = len(self.directory) // self.RECORD_SIZE

    def lookup(self, key: str):
        encoded = key.encode("utf-8")
        low, high = 0, self.count
        while low < high:
            middle = (low + high) // 2
            offset, length, _, post_offset, post_count = struct.unpack_from(
                "<IHHII", self.directory, middle * self.RECORD_SIZE
            )
            candidate = self.keys[offset : offset + length]
            if candidate < encoded:
                low = middle + 1
            else:
                high = middle
        if low >= self.count:
            return []
        offset, length, _, post_offset, post_count = struct.unpack_from(
            "<IHHII", self.directory, low * self.RECORD_SIZE
        )
        if self.keys[offset : offset + length] != encoded:
            return []
        return list(
            struct.unpack_from(
                f"<{post_count}I", self.postings, post_offset * 4
            )
        )


class DawgReader:
    NODE_SIZE = 16
    EDGE_SIZE = 8

    def __init__(self, path: Path):
        self.nodes = (path / "nodes.bin").read_bytes()
        self.edges = (path / "edges.bin").read_bytes()
        self.postings = (path / "postings.bin").read_bytes()

    def lookup(self, key: str):
        node_index = 0
        for label in key.encode("utf-8"):
            edge_start, edge_count, _, _, _ = struct.unpack_from(
                "<IHHII", self.nodes, node_index * self.NODE_SIZE
            )
            low, high = 0, edge_count
            while low < high:
                middle = (low + high) // 2
                candidate, target = struct.unpack_from(
                    "<B3xI",
                    self.edges,
                    (edge_start + middle) * self.EDGE_SIZE,
                )
                if candidate < label:
                    low = middle + 1
                else:
                    high = middle
            if low >= edge_count:
                return []
            candidate, target = struct.unpack_from(
                "<B3xI", self.edges, (edge_start + low) * self.EDGE_SIZE
            )
            if candidate != label:
                return []
            node_index = target
        _, _, final, post_offset, post_count = struct.unpack_from(
            "<IHHII", self.nodes, node_index * self.NODE_SIZE
        )
        if not final:
            return []
        return list(
            struct.unpack_from(
                f"<{post_count}I", self.postings, post_offset * 4
            )
        )


def percentile(values: list[float], fraction: float) -> float:
    values = sorted(values)
    index = min(len(values) - 1, math.ceil(len(values) * fraction) - 1)
    return values[index]


def benchmark(reader, queries: list[str], expected: dict[str, list[int]]) -> dict:
    timings = []
    mismatches = 0
    for query in queries:
        start = time.perf_counter_ns()
        actual = reader.lookup(query)
        timings.append((time.perf_counter_ns() - start) / 1_000_000)
        if actual != expected.get(query, []):
            mismatches += 1
    return {
        "queries": len(queries),
        "mismatches": mismatches,
        "p50Ms": statistics.median(timings),
        "p95Ms": percentile(timings, 0.95),
        "maxMs": max(timings),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    lemmas, results, index = build_semantic_model(args.input)
    common = args.output / "common"
    common.mkdir(exist_ok=True)
    (common / "lemmas.json").write_bytes(canonical_json(lemmas))
    (common / "results.json").write_bytes(canonical_json(results))

    candidates = {
        "json-shards": (build_json_shards, JsonShardReader),
        "sorted-table": (build_sorted_table, SortedTableReader),
        "minimal-dawg": (build_minimal_dawg, DawgReader),
    }
    reports = {}
    keys = list(index)
    randomizer = random.Random(20261003)
    hits = [randomizer.choice(keys) for _ in range(8000)]
    misses = [f"{randomizer.choice(keys)}-missing-{number}" for number in range(2000)]
    queries = hits + misses
    randomizer.shuffle(queries)

    for name, (builder, reader_type) in candidates.items():
        target = args.output / name
        build_start = time.perf_counter()
        builder(index, target)
        build_seconds = time.perf_counter() - build_start
        archive = args.output / f"{name}.zip"
        deterministic_zip([common, target], archive)
        load_start = time.perf_counter()
        reader = reader_type(target)
        load_ms = (time.perf_counter() - load_start) * 1000
        first = benchmark(reader, queries[:100], index)
        warm = benchmark(reader, queries, index)
        reports[name] = {
            "buildSeconds": build_seconds,
            "loadMs": load_ms,
            "index": directory_stats(target),
            "package": {
                "zipBytes": archive.stat().st_size,
                "zipSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "installedBytes": directory_stats(target)["bytes"]
                + directory_stats(common)["bytes"],
            },
            "first100": first,
            "warm": warm,
        }

    report = {
        "schemaVersion": 1,
        "input": {
            "editions": list(EDITIONS),
            "records": len(lemmas),
            "results": len(results),
            "keys": len(index),
            "ambiguousKeys": sum(1 for values in index.values() if len(values) > 1),
            "common": directory_stats(common),
        },
        "normalization": "NFD -> remove U+0301 -> NFC -> casefold; ё remains distinct from е",
        "benchmark": {
            "runtime": "CPython standard library reference; Chromium validation belongs to S03",
            "queries": len(queries),
            "hitRatio": 0.8,
            "seed": 20261003,
        },
        "candidates": reports,
        "elapsedSeconds": time.perf_counter() - started,
    }
    path = args.output / "report.json"
    path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
