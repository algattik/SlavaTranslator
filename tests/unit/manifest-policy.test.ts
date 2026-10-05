import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { WIKTIONARY_HOSTS } from "../../src/config/wiktionary-hosts";

interface Manifest {
  action?: {
    default_icon?: Record<string, string>;
  };
  background?: {
    service_worker?: string;
  };
  host_permissions?: string[];
  icons?: Record<string, string>;
  manifest_version?: number;
  optional_host_permissions?: string[];
  permissions?: string[];
}

describe("generated manifest policy", () => {
  it("uses Manifest V3 with only the approved required permissions", async () => {
    const manifest = JSON.parse(
      await readFile(".output/chrome-mv3/manifest.json", "utf8"),
    ) as Manifest;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background?.service_worker).toBeTypeOf("string");
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["activeTab", "scripting", "storage"]),
    );
    expect(manifest.permissions).not.toContain("<all_urls>");
    expect(manifest.host_permissions?.sort()).toEqual(
      [...WIKTIONARY_HOSTS].sort(),
    );
    expect(manifest.host_permissions).not.toContain("https://*/*");
    expect(manifest.optional_host_permissions?.sort()).toEqual([
      "http://*/*",
      "https://*/*",
    ]);
  });

  it("uses the original owl identity with a face-only toolbar icon", async () => {
    const manifest = JSON.parse(
      await readFile(".output/chrome-mv3/manifest.json", "utf8"),
    ) as Manifest;
    const expected = {
      "16": "/owl_16.png",
      "48": "/owl_48.png",
      "128": "/owl_128.png",
    };

    expect(manifest.icons).toEqual(expected);
    expect(manifest.action?.default_icon).toEqual({
      "16": "/owl_face_16.png",
      "32": "/owl_face_32.png",
      "48": "/owl_face_48.png",
    });
  });
});
