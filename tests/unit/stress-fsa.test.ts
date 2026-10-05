import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  inherentYoStress,
  normalizeStressForm,
  StressFsa,
} from "../../src/indexes/stress-fsa";

let fsa: StressFsa;

beforeAll(async () => {
  const bytes = await readFile(
    path.resolve("public/indexes/stress/dictionary.bin"),
  );
  fsa = new StressFsa(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
});

describe("stress FSA", () => {
  it.each([
    ["говорить", [[5]]],
    ["молоко", [[5]]],
    ["красивый", [[4]]],
    ["автопортрет", [[0, 9]]],
    ["отдано", [[0]]],
  ])("returns deterministic stress positions for %s", (word, expected) => {
    expect(fsa.lookup(word)).toEqual(expected);
  });

  it("normalizes capitalization and combining accents", () => {
    expect(normalizeStressForm("Говори\u0301ть")).toBe("говорить");
    expect(fsa.lookup("ГОВОРИТЬ")).toEqual([[5]]);
  });

  it("treats yo as inherently stressed even when absent from the FSA", () => {
    expect(inherentYoStress("ёлка")).toEqual([0]);
  });

  it.each(["замок", "санкт-петербург", "несуществующее"])(
    "leaves ambiguous or missing %s unchanged",
    (word) => {
      expect(fsa.lookup(word)).toEqual([]);
    },
  );

  it("publishes artifact metadata and conflict evidence", async () => {
    const metadata = JSON.parse(
      await readFile(
        path.resolve("public/indexes/stress/metadata.json"),
        "utf8",
      ),
    ) as { artifactDigest: string; kind: string; snapshotDate: string };
    const conflicts = JSON.parse(
      await readFile(
        path.resolve("public/indexes/stress/conflicts.json"),
        "utf8",
      ),
    ) as string[];

    expect(metadata).toMatchObject({
      kind: "stress",
      snapshotDate: "2026-10-03",
    });
    expect(metadata.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(conflicts.length).toBeGreaterThan(0);
  });
});
