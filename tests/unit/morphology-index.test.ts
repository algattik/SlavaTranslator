import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import type { GrammarTag } from "../../src/contracts/local-index";
import {
  decodeStressPostings,
  MorphologyIndex,
  StringPostingsTable,
  YO_POSITION_FLAG,
} from "../../src/indexes/morphology-index";

let index: MorphologyIndex;
let supplementalStress: StringPostingsTable;

async function readBuffer(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(path.resolve("public/indexes/morphology", name));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

beforeAll(async () => {
  index = new MorphologyIndex({
    stemDirectory: await readBuffer("stem-directory.bin"),
    stemKeys: await readBuffer("stem-keys.bin"),
    stemPostings: await readBuffer("stem-postings.bin"),
    exceptionDirectory: await readBuffer("exception-directory.bin"),
    exceptionKeys: await readBuffer("exception-keys.bin"),
    exceptionPostings: await readBuffer("exception-postings.bin"),
    aspectDirectory: await readBuffer("aspect-directory.bin"),
    aspectKeys: await readBuffer("aspect-keys.bin"),
    aspectPostings: await readBuffer("aspect-postings.bin"),
    grammarDirectory: await readBuffer("grammar-directory.bin"),
    grammarKeys: await readBuffer("grammar-keys.bin"),
    grammarPostings: await readBuffer("grammar-postings.bin"),
    grammarAnalyses: JSON.parse(
      await readFile(
        path.resolve("public/indexes/morphology/grammar-analyses.json"),
        "utf8",
      ),
    ) as GrammarTag[][],
    descriptors: await readBuffer("descriptors.bin"),
    paradigms: JSON.parse(
      await readFile(
        path.resolve("public/indexes/morphology/paradigms.json"),
        "utf8",
      ),
    ) as string[][],
    lemmaDirectory: await readBuffer("lemma-directory.bin"),
    lemmas: await readBuffer("lemmas.bin"),
  });
  supplementalStress = new StringPostingsTable(
    await readBuffer("stress-directory.bin"),
    await readBuffer("stress-keys.bin"),
    await readBuffer("stress-postings.bin"),
  );
});

describe("morphology index", () => {
  it.each([
    ["говорил", "говорить"],
    ["говоришь", "говорить"],
    ["кошки", "кошка"],
    ["людьми", "человек"],
  ])("maps %s to the expected lemma %s", (form, lemma) => {
    expect(index.lookup(form)).toContain(lemma);
  });

  it("normalizes capitalization and stress", () => {
    expect(index.lookup("ГОВОРИ\u0301Л")).toContain("говорить");
  });

  it("preserves ambiguous candidates deterministically", () => {
    const candidates = index.lookup("стали");
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates).toEqual(
      [...candidates].sort((left, right) => left.localeCompare(right, "ru")),
    );
  });

  it("returns no candidate for mixed-script and absent surfaces", () => {
    expect(index.lookup("test")).toEqual([]);
    expect(index.lookup("несуществующеесловоформа")).toEqual([]);
  });

  it("retains exact-form stress evidence absent from the dedicated FSA", () => {
    expect(supplementalStress.get("иноагентов")).toEqual([5]);
    expect(supplementalStress.get("полок")).toEqual([1, 3]);
    expect(supplementalStress.get("году")).toEqual([1, 3]);
    expect(supplementalStress.get("поводу")).toEqual([1, 5]);
    expect(supplementalStress.get("нефтепродукты")).toEqual([9]);
    expect(decodeStressPostings(supplementalStress.get("твердого"))).toEqual({
      positions: [],
      yoPositions: [2],
    });
    expect(supplementalStress.get("твердого")).toEqual([YO_POSITION_FLAG + 2]);
    expect(decodeStressPostings(supplementalStress.get("подвел"))).toEqual({
      positions: [],
      yoPositions: [4],
    });
    expect(supplementalStress.get("несуществующеесловоформа")).toEqual([]);
  });

  it("preserves proper-noun lemma casing for Wiktionary titles", () => {
    expect(index.lookup("России")).toContain("Россия");
  });

  it("maps pure form-of entries only to their lexical lemmas", () => {
    expect(index.lookup("Старый")).toContain("старый");
    expect(index.lookup("Старый")).not.toContain("старому");
    expect(index.lookup("читают")).toContain("читать");
    expect(index.lookup("читают")).not.toContain("читают");
    expect(index.lookup("угрозы")).toContain("угроза");
    expect(index.lookup("угрозы")).not.toContain("угрозы");
  });

  it("collapses grammatical analyses that differ only by added specificity", () => {
    const analyses = index.lookupGrammar("изменилось").get("измениться");
    expect(analyses).toHaveLength(1);
    expect(analyses?.[0]).toEqual(["neuter", "singular", "past", "indicative"]);
  });

  it("separates verb aspect partners from inflection ownership", () => {
    expect(index.lookup("разбухать")).toEqual(["разбухать"]);
    expect(index.lookupAspect("разбухать")).toEqual({
      aspect: "imperfective",
      counterparts: ["разбухнуть"],
    });
    expect(index.lookupAspect("разбухнуть")).toEqual({
      aspect: "perfective",
      counterparts: ["разбухать"],
    });
  });

  it("follows explicit alternative spellings without pure form pages", () => {
    expect(index.lookup("сел")).toEqual(["сёл", "сесть"]);
    expect(index.lookup("указъ")).toContain("указ");
    expect(index.lookup("л")).not.toContain("лампа");
  });

  it("does not treat derivational relatives as inflections", () => {
    expect(index.lookup("собачий")).not.toContain("собака");
    expect(index.lookup("зонтик")).not.toContain("зонт");
    expect(index.lookup("кошка")).not.toContain("кот");
    expect(index.lookup("от")).toContain("от");
  });

  it("does not assign shared pronoun tables to every pronoun", () => {
    expect(index.lookup("я")).toContain("я");
    expect(index.lookup("я")).not.toEqual(
      expect.arrayContaining(["он", "она", "мы", "ты"]),
    );
    expect(index.lookup("мне")).toContain("я");
  });

  it("uses explicit form-of targets for missing inflection links", () => {
    expect(index.lookup("пенька")).toContain("пенёк");
    expect(index.lookup("подвел")).toContain("подвести");
    expect(index.lookup("углубленное")).toContain("углублённый");
    expect(index.lookup("отдано")).toContain("отдать");
    expect(index.lookup("больше")).toEqual(
      expect.arrayContaining(["большой", "больший"]),
    );
  });

  it("assigns every exact-form grammatical analysis to lexical lemmas", () => {
    expect(index.lookupGrammar("сельские").get("сельский")).toEqual([
      ["nominative", "plural"],
      ["accusative", "inanimate", "plural"],
    ]);
    expect(index.lookupGrammar("библиотеки").get("библиотека")).toEqual([
      ["nominative", "plural"],
      ["genitive", "singular"],
      ["accusative", "plural"],
    ]);
  });
});
