import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFINITION_FIXTURE_SCHEMA_VERSION,
  type DefinitionFixtureMetadata,
} from "../../src/contracts/definition-fixture";
import { DEFINITION_EDITIONS } from "../../src/contracts/definition";

const fixtureRoot = path.resolve("tests/fixtures/mediawiki");

interface CapturedFixture {
  metadata: DefinitionFixtureMetadata;
  response: unknown;
}

const usableTitles = {
  en: "говорить",
  ru: "говорить",
  uk: "говорить",
  de: "говорить",
  fr: "говорить",
  es: "идти",
  pt: "говорить",
  zh: "говорить",
  ja: "говорить",
  ko: "говорить",
  ar: "говорить",
  hi: "Россия",
  he: "сила",
  pl: "говорить",
  ro: "Россия",
  tr: "говорить",
  it: "говорить",
  kk: "Россия",
  lv: "Россия",
  et: "говорить",
  lt: "говорить",
} as const;

async function readFixture(relativePath: string): Promise<CapturedFixture> {
  return JSON.parse(
    await readFile(path.join(fixtureRoot, relativePath), "utf8"),
  ) as CapturedFixture;
}

describe("MediaWiki fixtures", () => {
  it.each(DEFINITION_EDITIONS)(
    "has a bounded attributed usable %s fixture",
    async (edition) => {
      const requestedTitle = usableTitles[edition];
      const fixture = await readFixture(`${edition}/${requestedTitle}.json`);
      expect(fixture.metadata).toMatchObject({
        schemaVersion: DEFINITION_FIXTURE_SCHEMA_VERSION,
        edition,
        requestedTitle,
        scenario: "usable",
      });
      expect(fixture.metadata.revisionId).toBeGreaterThan(0);
      expect(fixture.metadata.license).toContain("Wiktionary");
      expect(new URL(fixture.metadata.sourceUrl).origin).toBe(
        `https://${edition}.wiktionary.org`,
      );
      expect(
        Buffer.byteLength(JSON.stringify(fixture.response)),
      ).toBeLessThanOrEqual(2 * 1024 * 1024);
    },
  );

  it("includes a real missing-page response", async () => {
    const fixture = await readFixture("de/missing.json");
    expect(fixture.metadata.scenario).toBe("missing");
    expect(fixture.metadata.resolvedTitle).toBeNull();
    expect(fixture.metadata.revisionId).toBeNull();
  });

  it("captures the English Russian predicative structure", async () => {
    const fixture = await readFixture("en/должен.json");
    expect(fixture.metadata).toMatchObject({
      schemaVersion: DEFINITION_FIXTURE_SCHEMA_VERSION,
      edition: "en",
      requestedTitle: "должен",
      scenario: "usable",
    });
    expect(fixture.metadata.revisionId).toBeGreaterThan(0);
  });

  it("captures Chinese Russian letter, preposition, and prefix sections", async () => {
    const fixture = await readFixture("zh/с.json");
    expect(fixture.metadata).toMatchObject({
      schemaVersion: DEFINITION_FIXTURE_SCHEMA_VERSION,
      edition: "zh",
      requestedTitle: "с",
      scenario: "usable",
    });
    expect(fixture.metadata.revisionId).toBeGreaterThan(0);
  });

  it("covers deterministic parser and transport failure scenarios", async () => {
    const files = await readdir(path.join(fixtureRoot, "synthetic"));
    const fixtures = await Promise.all(
      files
        .filter((file) => file !== "transport-cases.json")
        .map((file) => readFixture(`synthetic/${file}`)),
    );
    const transportCases = JSON.parse(
      await readFile(
        path.join(fixtureRoot, "synthetic/transport-cases.json"),
        "utf8",
      ),
    ) as DefinitionFixtureMetadata[];
    const scenarios = new Set([
      ...fixtures.map(({ metadata }) => metadata.scenario),
      ...transportCases.map(({ scenario }) => scenario),
    ]);

    expect(scenarios).toEqual(
      new Set([
        "redirect",
        "malformed",
        "hostile",
        "oversized",
        "no-russian-entry",
        "timeout",
        "aborted",
        "wrong-origin",
        "wrong-content-type",
      ]),
    );
  });
});
