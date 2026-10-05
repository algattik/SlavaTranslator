import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface SourceEntry {
  id: string;
  purpose: string;
  fileName: string;
  url: string;
  revision: string;
  expectedBytes: number;
  expectedSha256: string;
  license: string;
}

describe("index source policy", () => {
  it("pins every source to an exact identity and license", async () => {
    const manifest = JSON.parse(
      await readFile(path.resolve("data/config/index-sources.json"), "utf8"),
    ) as { schemaVersion: number; sources: SourceEntry[] };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sources.map(({ purpose }) => purpose)).toEqual([
      "stress",
      "license",
      "morphology",
    ]);
    for (const source of manifest.sources) {
      expect(source.id).not.toHaveLength(0);
      expect(source.revision).not.toHaveLength(0);
      expect(source.expectedBytes).toBeGreaterThan(0);
      expect(source.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.license).not.toHaveLength(0);
      expect(new URL(source.url).protocol).toBe("https:");
      expect(path.basename(source.fileName)).toBe(source.fileName);
    }
  });

  it("forbids definition fields from packaged index output", async () => {
    const policy = JSON.parse(
      await readFile(path.resolve("data/config/index-policy.json"), "utf8"),
    ) as {
      morphologyFields: string[];
      packagedDefinitionFields: string[];
    };

    expect(policy.morphologyFields).toEqual([
      "word",
      "pos",
      "forms[].form",
      "forms[].source",
      "forms[].tags",
      "senses[].tags",
      "senses[].form_of[].word",
      "senses[].alt_of[].word",
    ]);
    expect(policy.packagedDefinitionFields).toEqual([]);
  });
});
