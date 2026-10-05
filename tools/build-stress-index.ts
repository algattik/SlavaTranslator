import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { deflateRawSync } from "node:zlib";

import { normalizeStressForm, StressFsa } from "../src/indexes/stress-fsa.ts";

const cacheDirectory = path.resolve(
  process.env.SLAVA_SOURCE_CACHE ?? ".cache/slava-sources",
);
const outputDirectory = path.resolve("public/indexes/stress");
const generatedDirectory = path.resolve("data/generated");
const noticeDirectory = path.resolve("public/notices");
const compressedBudget = 0.75 * 1024 * 1024;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildFileMetadata(bytes: Uint8Array) {
  const chunkSize = 64 * 1024;
  const chunks = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(`sha256:${sha256(bytes.subarray(offset, offset + chunkSize))}`);
  }
  return {
    bytes: bytes.byteLength,
    digest: `sha256:${sha256(bytes)}`,
    chunkSize,
    chunks,
  };
}

function stressPositions(value: string): number[] {
  const positions: number[] = [];
  let position = -1;
  for (const character of value.normalize("NFD")) {
    if (character === "\u0301") {
      if (position >= 0) {
        positions.push(position);
      }
    } else if (!/\p{Mark}/u.test(character)) {
      position += 1;
      if (character.toLocaleLowerCase("ru") === "ё") {
        positions.push(position);
      }
    }
  }
  return [...new Set(positions)].sort((left, right) => left - right);
}

function patternsEqual(left: number[][], right: number[][]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const dictionaryPath = path.join(cacheDirectory, "stress-dictionary.bin");
const licensePath = path.join(cacheDirectory, "stress-LICENSE.txt");
const morphologyPath = path.join(cacheDirectory, "kaikki-en.jsonl");
const dictionary = await readFile(dictionaryPath);
const fsa = new StressFsa(
  dictionary.buffer.slice(
    dictionary.byteOffset,
    dictionary.byteOffset + dictionary.byteLength,
  ),
);

const expected = new Map<string, Set<string>>();
let sourceRecords = 0;
let candidateValues = 0;
let malformedRecords = 0;
const lines = createInterface({
  input: createReadStream(morphologyPath, { encoding: "utf8" }),
  crlfDelay: Number.POSITIVE_INFINITY,
});
for await (const line of lines) {
  sourceRecords += 1;
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    malformedRecords += 1;
    continue;
  }
  if (typeof record !== "object" || record === null) {
    malformedRecords += 1;
    continue;
  }
  const candidate = record as { word?: unknown; forms?: unknown };
  const values: unknown[] = [candidate.word];
  if (Array.isArray(candidate.forms)) {
    values.push(
      ...candidate.forms.map((form) =>
        typeof form === "object" && form !== null
          ? (form as { form?: unknown }).form
          : undefined,
      ),
    );
  }
  for (const value of values) {
    candidateValues += 1;
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    const positions = stressPositions(value);
    if (positions.length === 0) {
      continue;
    }
    const key = normalizeStressForm(value);
    const patterns = expected.get(key) ?? new Set<string>();
    patterns.add(positions.join(","));
    expected.set(key, patterns);
  }
}

let hits = 0;
let exact = 0;
let conflicts = 0;
let missing = 0;
const conflictKeys: string[] = [];
const conflictExamples: Array<{
  key: string;
  kaikki: number[][];
  dedicated: number[][];
}> = [];
for (const [key, serializedPatterns] of [...expected].sort(([left], [right]) =>
  left.localeCompare(right, "ru"),
)) {
  const expectedPatterns = [...serializedPatterns]
    .map((pattern) =>
      pattern.length === 0
        ? []
        : pattern.split(",").map((value) => Number.parseInt(value, 10)),
    )
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const actual = fsa.lookup(key);
  if (actual.length === 0) {
    missing += 1;
  } else if (patternsEqual(actual, expectedPatterns)) {
    hits += 1;
    exact += 1;
  } else {
    hits += 1;
    conflicts += 1;
    conflictKeys.push(key);
    if (conflictExamples.length < 100) {
      conflictExamples.push({
        key,
        kaikki: expectedPatterns,
        dedicated: actual,
      });
    }
  }
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });
await mkdir(noticeDirectory, { recursive: true });
await copyFile(dictionaryPath, path.join(outputDirectory, "dictionary.bin"));
await copyFile(
  licensePath,
  path.join(noticeDirectory, "russian-stress-marker.LICENSE.txt"),
);
const conflictsBytes = Buffer.from(`${JSON.stringify(conflictKeys)}\n`);
await writeFile(path.join(outputDirectory, "conflicts.json"), conflictsBytes);

const artifactDigest = sha256(
  Buffer.concat([
    Buffer.from("dictionary.bin\0"),
    dictionary,
    Buffer.from("conflicts.json\0"),
    conflictsBytes,
  ]),
);

const metadata = {
  schemaVersion: 1,
  kind: "stress",
  sourceRevision: "1cd1a1555f01bbbaeebb2d4fd15fe5e9d52c9a37",
  sourceDigest: `sha256:${sha256(dictionary)}`,
  artifactDigest: `sha256:${artifactDigest}`,
  snapshotDate: "2026-10-03",
  recordCount: dictionary.byteLength / 4,
  files: {
    "dictionary.bin": buildFileMetadata(dictionary),
    "conflicts.json": buildFileMetadata(conflictsBytes),
  },
};
const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "metadata.json"), metadataBytes);

const compressedBytes =
  deflateRawSync(dictionary, { level: 9 }).byteLength +
  deflateRawSync(conflictsBytes, { level: 9 }).byteLength +
  deflateRawSync(metadataBytes, { level: 9 }).byteLength +
  512;
if (compressedBytes > compressedBudget) {
  throw new Error(
    `Stress package compressed size ${compressedBytes} exceeds ${compressedBudget}`,
  );
}

const report = {
  schemaVersion: 1,
  source: {
    records: sourceRecords,
    candidateValues,
    malformedRecords,
    stressBearingKeys: expected.size,
  },
  compatibility: {
    hits,
    exact,
    conflicts,
    missing,
    conflictExamples,
  },
  artifact: {
    bytes: dictionary.byteLength,
    compressedBytes,
    sha256: artifactDigest,
    conflictKeys: conflictKeys.length,
  },
};
await writeFile(
  path.join(generatedDirectory, "stress-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  path.join(generatedDirectory, "stress-quality.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: {
        url: "https://raw.githubusercontent.com/zdarsch/russian-stress-marker/1cd1a1555f01bbbaeebb2d4fd15fe5e9d52c9a37/ru_stress_marker/dictionary",
        snapshotDate: "2026-10-03",
        digest: `sha256:${sha256(dictionary)}`,
        extractorRevision: "1cd1a1555f01bbbaeebb2d4fd15fe5e9d52c9a37",
      },
      recordFlow: {
        sourceRecordsSeen: 1,
        eligibleRecords: 1,
        emittedRecords: 1,
        filteredRecords: 0,
        rejectedRecords: 0,
      },
      artifact: {
        kind: "stress",
        bytes: dictionary.byteLength,
        digest: `sha256:${sha256(dictionary)}`,
      },
    },
    null,
    2,
  )}\n`,
);
