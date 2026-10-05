import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface FileMetadata {
  bytes: number;
  digest: string;
  chunkSize: number;
  chunks: string[];
}

interface IndexMetadata {
  artifactDigest: string;
  files: Record<string, FileMetadata>;
}

const digest = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function verifyIndex(kind: "stress" | "morphology"): Promise<void> {
  const directory = path.resolve("public/indexes", kind);
  const metadata = JSON.parse(
    await readFile(path.join(directory, "metadata.json"), "utf8"),
  ) as IndexMetadata;
  const artifactHash = createHash("sha256");

  for (const [name, expected] of Object.entries(metadata.files)) {
    const bytes = await readFile(path.join(directory, name));
    expect(bytes.byteLength, name).toBe(expected.bytes);
    expect(digest(bytes), name).toBe(expected.digest);
    expect(
      Array.from(
        { length: Math.ceil(bytes.byteLength / expected.chunkSize) },
        (_, index) =>
          digest(
            bytes.subarray(
              index * expected.chunkSize,
              Math.min((index + 1) * expected.chunkSize, bytes.byteLength),
            ),
          ),
      ),
      name,
    ).toEqual(expected.chunks);
    artifactHash.update(name);
    artifactHash.update("\0");
    artifactHash.update(bytes);
  }

  expect(`sha256:${artifactHash.digest("hex")}`).toBe(metadata.artifactDigest);
}

describe("generated index artifacts", () => {
  it("matches every declared file, chunk, and aggregate digest", async () => {
    await verifyIndex("stress");
    await verifyIndex("morphology");
  });

  it("retains zero-mismatch semantics, balanced flow, and size budgets", async () => {
    const morphology = JSON.parse(
      await readFile("data/generated/morphology-report.json", "utf8"),
    ) as {
      recordFlow: {
        eligibleRecords: number;
        emittedRecords: number;
        filteredRecords: number;
        rejectedRecords: number;
      };
      index: { semanticMismatches: number };
      artifact: { installedBytes: number; compressedBytes: number };
    };
    const stress = JSON.parse(
      await readFile("data/generated/stress-report.json", "utf8"),
    ) as {
      artifact: { compressedBytes: number; conflictKeys: number };
    };
    const morphologyFiles = await readdir("public/indexes/morphology");
    const installedBytes = (
      await Promise.all(
        morphologyFiles.map(
          async (name) =>
            (await readFile(path.join("public/indexes/morphology", name)))
              .byteLength,
        ),
      )
    ).reduce((total, bytes) => total + bytes, 0);

    expect(morphology.index.semanticMismatches).toBe(0);
    expect(
      morphology.recordFlow.emittedRecords +
        morphology.recordFlow.filteredRecords +
        morphology.recordFlow.rejectedRecords,
    ).toBe(morphology.recordFlow.eligibleRecords);
    expect(installedBytes).toBe(morphology.artifact.installedBytes);
    expect(morphology.artifact.compressedBytes).toBeLessThanOrEqual(
      15 * 1024 * 1024,
    );
    expect(stress.artifact.compressedBytes).toBeLessThanOrEqual(768 * 1024);
    expect(stress.artifact.conflictKeys).toBeGreaterThan(0);
  });
});
