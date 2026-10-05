import { describe, expect, it } from "vitest";

import {
  UI_LOCALES,
  definitionErrorMessage,
  grammarLabel,
  localeDirection,
  message,
  normalizeUiLocale,
  resolveUiLocale,
} from "../../src/i18n/catalog";

describe("interface localization", () => {
  it("normalizes supported browser locales and falls back to English", () => {
    expect(normalizeUiLocale("fr-CA")).toBe("fr");
    expect(normalizeUiLocale("pt_PT")).toBe("pt-BR");
    expect(normalizeUiLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeUiLocale("he-IL")).toBe("he");
    expect(normalizeUiLocale("pl-PL")).toBe("pl");
    expect(normalizeUiLocale("ro_RO")).toBe("ro");
    expect(normalizeUiLocale("tr-TR")).toBe("tr");
    expect(normalizeUiLocale("it-IT")).toBe("it");
    expect(normalizeUiLocale("kk-KZ")).toBe("kk");
    expect(normalizeUiLocale("lv-LV")).toBe("lv");
    expect(normalizeUiLocale("et-EE")).toBe("et");
    expect(normalizeUiLocale("lt-LT")).toBe("lt");
    expect(normalizeUiLocale("nl-NL")).toBe("en");
    expect(resolveUiLocale("ru", "fr-FR")).toBe("ru");
    expect(resolveUiLocale("auto", "fr-FR")).toBe("fr");
  });

  it("includes every approved interface locale", () => {
    expect(UI_LOCALES).toEqual(
      expect.arrayContaining([
        "he",
        "pl",
        "ro",
        "tr",
        "it",
        "kk",
        "lv",
        "et",
        "lt",
      ]),
    );
  });

  it("localizes the persistent site disable control", () => {
    for (const locale of UI_LOCALES) {
      expect(message(locale, "disablePersistent")).not.toHaveLength(0);
      if (locale !== "en") {
        expect(message(locale, "disablePersistent")).not.toBe(
          "Disable on this site",
        );
      }
    }
  });

  it("localizes grammar, errors, substitutions, and writing direction", () => {
    expect(grammarLabel("fr", "passive")).toBe("passif");
    expect(grammarLabel("fr", "infinitive")).toBe("infinitif");
    expect(definitionErrorMessage("fr", "api-changed")).not.toContain(
      "Wiktionary changed",
    );
    expect(message("fr", "loadingDefinition")).toBe(
      "Chargement des définitions…",
    );
    expect(message("en", "loadingDefinition")).not.toContain("Wiktionary");
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("he")).toBe("rtl");
    expect(localeDirection("fr")).toBe("ltr");
    for (const locale of [
      "pl",
      "ro",
      "tr",
      "it",
      "kk",
      "lv",
      "et",
      "lt",
    ] as const) {
      expect(localeDirection(locale)).toBe("ltr");
    }
  });

  it.each([
    ["he", "סביל"],
    ["pl", "strona bierna"],
    ["ro", "diateză pasivă"],
    ["tr", "edilgen"],
    ["it", "passivo"],
    ["kk", "ырықсыз етіс"],
    ["lv", "ciešamā kārta"],
    ["et", "umbisikuline tegumood"],
    ["lt", "neveikiamoji rūšis"],
  ] as const)("localizes common grammar tags for %s", (locale, passive) => {
    expect(grammarLabel(locale, "passive")).toBe(passive);
    expect(grammarLabel(locale, "first-person")).not.toBe("first person");
    expect(grammarLabel(locale, "short-form")).not.toBe("short form");
  });

  it.each(["he", "pl", "ro", "tr", "it", "kk", "lv", "et", "lt"] as const)(
    "localizes messages and definition errors for %s",
    (locale) => {
      expect(message(locale, "actionFailed")).not.toBe(
        "The action could not be completed.",
      );
      expect(
        message(locale, "cacheSummary", {
          entries: 3,
          hits: 2,
          misses: 1,
        }),
      ).toContain("3");
      expect(
        message(locale, "persistentGranted", {
          origin: "https://example.test",
        }),
      ).toContain("https://example.test");
      expect(definitionErrorMessage(locale, "offline")).not.toBe(
        "Definitions are unavailable while offline.",
      );
      expect(definitionErrorMessage(locale, "unexpected-origin")).not.toBe(
        "The response came from an unexpected site.",
      );
    },
  );
});
