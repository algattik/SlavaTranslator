import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { LocalIndexMetadata } from "../../src/contracts/local-index";
import { VerifiedAssetReader } from "../../src/indexes/verified-asset-reader";

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function metadata(bytes: Uint8Array, chunkSize: number): LocalIndexMetadata {
  const chunks: Array<`sha256:${string}`> = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(digest(bytes.slice(offset, offset + chunkSize)));
  }
  return {
    schemaVersion: 1,
    kind: "morphology",
    stringEncoding: "windows-1251-with-utf-8-fallback",
    sourceRevision: "test",
    sourceDigest: digest(bytes),
    artifactDigest: digest(bytes),
    snapshotDate: "2026-10-03",
    recordCount: 1,
    files: {
      "asset.bin": {
        bytes: bytes.byteLength,
        digest: digest(bytes),
        chunkSize,
        chunks,
      },
    },
  };
}

describe("verified asset reader", () => {
  it("verifies full files and Chrome-style partial 200 responses", async () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("range");
      if (range === null) {
        return Promise.resolve(new Response(bytes));
      }
      const match = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (match === null) {
        return Promise.resolve(new Response(null, { status: 416 }));
      }
      const start = Number.parseInt(match[1] ?? "", 10);
      const end = Number.parseInt(match[2] ?? "", 10);
      return Promise.resolve(new Response(bytes.slice(start, end + 1)));
    }) as typeof fetch;
    const reader = new VerifiedAssetReader(
      "chrome-extension://test/index/",
      metadata(bytes, 8),
      fetcher,
      2,
    );

    expect(new Uint8Array(await reader.readAll("asset.bin"))).toEqual(bytes);
    expect(new Uint8Array(await reader.readRange("asset.bin", 6, 12))).toEqual(
      bytes.slice(6, 18),
    );
    expect(reader.diagnostics.cachedChunks).toBe(2);
  });

  it("fails closed on a mismatched verified chunk", async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response(Uint8Array.from([1, 2, 3, 5]))),
    ) as typeof fetch;
    const reader = new VerifiedAssetReader(
      "chrome-extension://test/index/",
      metadata(bytes, 4),
      fetcher,
    );

    await expect(reader.readRange("asset.bin", 0, 4)).rejects.toThrow(
      "failed verification",
    );
  });
});
