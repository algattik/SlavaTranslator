import { describe, expect, it } from "vitest";

import { MAX_LEMMA_CODE_POINTS } from "../../src/contracts/definition";
import {
  InvalidLemmaError,
  normalizeLemma,
} from "../../src/domain/normalize-lemma";
import {
  inherentYoStress,
  normalizeStressForm,
  StressFsa,
} from "../../src/indexes/stress-fsa";
import { StringPostingsTable } from "../../src/indexes/morphology-index";
import {
  decodeIndexString,
  encodeIndexString,
} from "../../src/indexes/windows-1251";

const CYRILLIC_SAMPLES = [
  "а",
  "б",
  "ё",
  "й",
  "я",
  "и\u0301",
  "ъ",
  "ь",
] as const;

describe("domain normalization properties", () => {
  it("normalizes generated Cyrillic words idempotently", () => {
    for (let seed = 1; seed <= 128; seed++) {
      const length = (seed % 24) + 1;
      const characters = Array.from(
        { length },
        (_, index) => CYRILLIC_SAMPLES[(seed * 17 + index * 11) % 8] ?? "а",
      );
      const separator = seed % 3 === 0 ? "-" : seed % 5 === 0 ? "’" : "";
      const raw =
        separator.length === 0
          ? characters.join("")
          : `${characters.join("")}${separator}слово`;
      const normalized = normalizeLemma(` ${raw} `);

      expect(normalizeLemma(normalized)).toBe(normalized);
      expect([...normalized].length).toBeLessThanOrEqual(MAX_LEMMA_CODE_POINTS);
    }
  });

  it.each([
    "\u0000слово",
    "слово\u0007",
    "слово\u200d",
    "слово\nдва",
    "word",
    "слово🙂",
    "слово/path",
    "слово\u00a0два",
  ])("rejects hostile or non-word Unicode %j", (value) => {
    expect(() => normalizeLemma(value)).toThrow(InvalidLemmaError);
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(() =>
      normalizeLemma("я".repeat(MAX_LEMMA_CODE_POINTS)),
    ).not.toThrow();
    expect(() => normalizeLemma("я".repeat(MAX_LEMMA_CODE_POINTS + 1))).toThrow(
      InvalidLemmaError,
    );
  });

  it("removes combining stress idempotently and preserves inherent yo", () => {
    for (const value of [
      "Говори\u0301ть",
      "тё\u0300мно-зелёный",
      "всё\u0301",
      "ЁЛКА",
      "по\u0301езд",
    ]) {
      const normalized = normalizeStressForm(value);
      expect(normalizeStressForm(normalized)).toBe(normalized);
      expect(normalized).not.toContain("\u0301");
      expect(normalized).not.toContain("\u0300");
    }
    expect(inherentYoStress("трёхъёмный")).toEqual([2, 5]);
  });

  it("normalizes dictionary punctuation and round-trips Windows-1251", () => {
    const normalized = normalizeStressForm("СЛОВО‑ТЕСТ’ЁЖ");
    expect(normalized).toBe("слово-тест'ёж");
    const encoded = encodeIndexString(normalized);
    expect(decodeIndexString(encoded.bytes, encoded.encoding)).toBe(normalized);
  });

  it("uses UTF-8 only for historical Cyrillic outside Windows-1251", () => {
    const encoded = encodeIndexString("ѳома");
    expect(encoded.encoding).toBe(1);
    expect(decodeIndexString(encoded.bytes, encoded.encoding)).toBe("ѳома");
  });
});

describe("binary index input boundaries", () => {
  it("rejects every short malformed stress dictionary length", () => {
    for (let byteLength = 1; byteLength < 32; byteLength++) {
      if (byteLength % 4 !== 0) {
        expect(() => new StressFsa(new ArrayBuffer(byteLength))).toThrow(
          "Stress dictionary byte length is not divisible by four",
        );
      }
    }
  });

  it("rejects malformed morphology directory and postings lengths", () => {
    for (let byteLength = 1; byteLength < 32; byteLength++) {
      if (byteLength % 16 !== 0) {
        expect(
          () =>
            new StringPostingsTable(
              new ArrayBuffer(byteLength),
              new ArrayBuffer(),
              new ArrayBuffer(),
            ),
        ).toThrow("Invalid morphology table directory");
      }
      if (byteLength % 4 !== 0) {
        expect(
          () =>
            new StringPostingsTable(
              new ArrayBuffer(),
              new ArrayBuffer(),
              new ArrayBuffer(byteLength),
            ),
        ).toThrow("Invalid morphology postings");
      }
    }
  });
});
