import { describe, expect, it } from "vitest";

import {
  DEFINITION_EDITIONS,
  getWiktionaryOrigin,
} from "../../src/contracts/definition";
import { isRuntimeRequest } from "../../src/contracts/messages";
import { isBalancedRecordFlow } from "../../src/contracts/quality-report";
import {
  InvalidLemmaError,
  normalizeLemma,
} from "../../src/domain/normalize-lemma";

describe("definition contracts", () => {
  it.each(DEFINITION_EDITIONS)("maps %s to its exact origin", (edition) => {
    expect(getWiktionaryOrigin(edition)).toBe(
      `https://${edition}.wiktionary.org`,
    );
  });

  it("keeps the supported edition set explicit", () => {
    expect(DEFINITION_EDITIONS).toEqual([
      "en",
      "ru",
      "uk",
      "de",
      "fr",
      "es",
      "pt",
      "zh",
      "ja",
      "ko",
      "ar",
      "hi",
      "he",
      "pl",
      "ro",
      "tr",
      "it",
      "kk",
      "lv",
      "et",
      "lt",
    ]);
  });
});

describe("lemma normalization", () => {
  it.each(["говорить", "Москва", "из-за", "объект", "всё́"])(
    "accepts %s",
    (lemma) => {
      expect(normalizeLemma(` ${lemma} `)).toBe(lemma.normalize("NFC"));
    },
  );

  it.each(["", "two words", "говорить\nчто", "word", "а".repeat(65)])(
    "rejects %j",
    (lemma) => {
      expect(() => normalizeLemma(lemma)).toThrow(InvalidLemmaError);
    },
  );
});

describe("quality report invariants", () => {
  it("balances eligible records", () => {
    expect(
      isBalancedRecordFlow({
        sourceRecordsSeen: 12,
        eligibleRecords: 10,
        emittedRecords: 7,
        filteredRecords: 2,
        rejectedRecords: 1,
      }),
    ).toBe(true);
  });

  describe("runtime message boundaries", () => {
    it("accepts bounded local lookup batches", () => {
      expect(
        isRuntimeRequest({
          kind: "local.lookup-batch",
          requestId: "batch",
          tokens: ["говорил", "слово"],
        }),
      ).toBe(true);
    });

    it("rejects empty and oversized local lookup batches", () => {
      expect(
        isRuntimeRequest({
          kind: "local.lookup-batch",
          requestId: "empty",
          tokens: [],
        }),
      ).toBe(false);
      expect(
        isRuntimeRequest({
          kind: "local.lookup-batch",
          requestId: "large",
          tokens: Array.from({ length: 129 }, () => "слово"),
        }),
      ).toBe(false);
    });

    it("requires a non-empty unique ordered provider list", () => {
      const base = {
        kind: "definition.lookup",
        payload: {
          contractVersion: 2,
          requestId: "definition",
          lemma: "говорить",
        },
      };
      expect(
        isRuntimeRequest({
          ...base,
          payload: { ...base.payload, editions: ["fr", "en"] },
        }),
      ).toBe(true);
      expect(
        isRuntimeRequest({
          ...base,
          payload: { ...base.payload, editions: [] },
        }),
      ).toBe(false);
      expect(
        isRuntimeRequest({
          ...base,
          payload: { ...base.payload, editions: ["fr", "fr"] },
        }),
      ).toBe(false);
    });

    it("requires the fields used by settings and permission requests", () => {
      expect(
        isRuntimeRequest({
          kind: "page.revoke-persistent",
          requestId: "revoke",
        }),
      ).toBe(false);
      expect(
        isRuntimeRequest({
          kind: "local.lookup",
          requestId: "lookup",
        }),
      ).toBe(false);
      expect(
        isRuntimeRequest({
          kind: "settings.update",
          requestId: "settings",
        }),
      ).toBe(false);
    });
  });

  it("rejects an unbalanced flow", () => {
    expect(
      isBalancedRecordFlow({
        sourceRecordsSeen: 10,
        eligibleRecords: 10,
        emittedRecords: 8,
        filteredRecords: 1,
        rejectedRecords: 0,
      }),
    ).toBe(false);
  });
});
