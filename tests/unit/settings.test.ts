import { describe, expect, it, vi } from "vitest";

import {
  filterGrantedPageOrigins,
  listGrantedPageOrigins,
  removePageOrigin,
  requestPageOrigin,
} from "../../src/settings/page-permissions";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizePageOrigin,
  parseSettings,
  saveSettings,
} from "../../src/settings/settings";

describe("settings", () => {
  it("normalizes supported page origins and rejects privileged schemes", () => {
    expect(normalizePageOrigin("https://example.com/path")).toBe(
      "https://example.com/*",
    );
    expect(normalizePageOrigin("http://localhost:3000/page")).toBe(
      "http://localhost:3000/*",
    );
    expect(normalizePageOrigin("chrome://extensions")).toBeNull();
    expect(normalizePageOrigin("file:///tmp/page.html")).toBeNull();
  });

  it("recovers safe defaults and canonical persistent origins", () => {
    expect(
      parseSettings({
        interfaceLocale: "fr",
        definitionEdition: "de",
        activationMode: "persistent",
        features: {
          stressMarks: false,
          definitionPopups: false,
        },
        persistentOrigins: [
          "https://example.com/a",
          "https://example.com/b",
          "chrome://extensions",
        ],
        accessibility: {
          reducedMotion: true,
          highContrast: true,
          fontScale: "large",
        },
        diagnosticsEnabled: true,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      interfaceLocale: "fr",
      definitionEditions: ["de", "en"],
      activationMode: "persistent",
      features: {
        stressMarks: false,
        definitionPopups: false,
      },
      persistentOrigins: ["https://example.com/*"],
      accessibility: {
        reducedMotion: true,
        highContrast: true,
        fontScale: "large",
      },
      diagnosticsEnabled: true,
    });
  });

  it("defaults missing and rejects unsupported interface locales", () => {
    expect(parseSettings({}).interfaceLocale).toBe("auto");
    expect(parseSettings({ interfaceLocale: "fr" }).interfaceLocale).toBe("fr");
    expect(parseSettings({ interfaceLocale: "sv" }).interfaceLocale).toBe(
      "auto",
    );
  });

  it("normalizes ordered providers and removes duplicates", () => {
    expect(
      parseSettings({ definitionEditions: ["fr", "de", "fr", "unknown"] })
        .definitionEditions,
    ).toEqual(["fr", "de"]);
    expect(
      parseSettings({ definitionEditions: [] }).definitionEditions,
    ).toEqual(["en"]);
  });

  it("loads and saves through the versioned storage boundary", async () => {
    const state: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(() => Promise.resolve(state)),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(state, values);
        return Promise.resolve();
      }),
    };

    expect(await loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    const saved = await saveSettings(storage, {
      ...DEFAULT_SETTINGS,
      definitionEditions: ["fr", "en"],
    });
    expect(saved.definitionEditions).toEqual(["fr", "en"]);
    expect((await loadSettings(storage)).definitionEditions).toEqual([
      "fr",
      "en",
    ]);
  });
});

describe("optional page permissions", () => {
  it("requests, lists, filters, and removes exact origins", async () => {
    const permissions = {
      request: vi.fn(() => Promise.resolve(true)),
      remove: vi.fn(() => Promise.resolve(true)),
      getAll: vi.fn(() =>
        Promise.resolve({
          origins: ["https://example.com/*", "chrome://extensions/*"],
        }),
      ),
      contains: vi.fn(({ origins }: { origins: string[] }) =>
        Promise.resolve(origins[0] === "https://example.com/*"),
      ),
    };

    expect(
      await requestPageOrigin(permissions, "https://example.com/page"),
    ).toBe("https://example.com/*");
    expect(await listGrantedPageOrigins(permissions)).toEqual([
      "https://example.com/*",
    ]);
    expect(
      await filterGrantedPageOrigins(permissions, [
        "https://example.com/*",
        "https://denied.example/*",
      ]),
    ).toEqual(["https://example.com/*"]);
    expect(
      await removePageOrigin(permissions, "https://example.com/path"),
    ).toBe(true);
  });
});
