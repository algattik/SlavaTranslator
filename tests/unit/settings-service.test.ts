/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";

import {
  handleSettingsRequest,
  PERSISTENT_SCRIPT_ID,
  synchronizePersistentRegistration,
  type SettingsServiceDependencies,
} from "../../src/background/settings-service";
import { DEFAULT_SETTINGS } from "../../src/settings/settings";

function createDependencies(
  settings = DEFAULT_SETTINGS,
): SettingsServiceDependencies & {
  stored: Record<string, unknown>;
} {
  const stored: Record<string, unknown> = { settings };
  return {
    stored,
    permissions: {
      contains: vi.fn(({ origins }: { origins: string[] }) =>
        Promise.resolve(origins[0] === "https://example.com/*"),
      ),
      getAll: vi.fn(() => Promise.resolve({ origins: [] })),
      remove: vi.fn(() => Promise.resolve(true)),
      request: vi.fn(() => Promise.resolve(true)),
    },
    scripting: {
      executeScript: vi.fn(() => Promise.resolve([])),
      getRegisteredContentScripts: vi.fn(() =>
        Promise.resolve([{ id: PERSISTENT_SCRIPT_ID }]),
      ),
      registerContentScripts: vi.fn(() => Promise.resolve()),
      unregisterContentScripts: vi.fn(() => Promise.resolve()),
    },
    storage: {
      get: vi.fn(() => Promise.resolve(stored)),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(stored, values);
        return Promise.resolve();
      }),
    },
    temporaryTabs: {
      activate: vi.fn(() => Promise.resolve()),
      deactivate: vi.fn(() => Promise.resolve()),
    },
    tabs: {
      query: vi.fn(() =>
        Promise.resolve([{ id: 7, url: "https://example.com/russian-text" }]),
      ),
      sendMessage: vi.fn(() => Promise.resolve(undefined)),
    },
  };
}

describe("settings background service", () => {
  it("reconstructs only still-granted persistent origins", async () => {
    const dependencies = createDependencies({
      ...DEFAULT_SETTINGS,
      activationMode: "persistent",
      persistentOrigins: ["https://denied.example/*", "https://example.com/*"],
    });

    await synchronizePersistentRegistration(dependencies);

    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual(["https://example.com/*"]);
    expect(
      dependencies.scripting.unregisterContentScripts,
    ).toHaveBeenCalledWith({ ids: [PERSISTENT_SCRIPT_ID] });
    expect(dependencies.scripting.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: PERSISTENT_SCRIPT_ID,
        js: ["/page-integration.js"],
        matches: ["https://example.com/*"],
        persistAcrossSessions: true,
      }),
    ]);
  });

  it("adopts browser-granted page origins but excludes definition providers", async () => {
    const dependencies = createDependencies();
    dependencies.permissions.getAll = vi.fn(() =>
      Promise.resolve({
        origins: ["https://en.wiktionary.org/*", "https://www.ng.ru/*"],
      }),
    );

    await synchronizePersistentRegistration(dependencies);

    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual(["https://www.ng.ru/*"]);
    expect(dependencies.scripting.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        matches: ["https://www.ng.ru/*"],
      }),
    ]);
  });

  it("injects temporary activation only into supported active pages", async () => {
    const dependencies = createDependencies();
    const response = await handleSettingsRequest(
      { kind: "page.activate-temporary", requestId: "request-1" },
      dependencies,
    );

    expect(response).toEqual({
      kind: "page.activation-result",
      requestId: "request-1",
      activated: true,
    });
    expect(dependencies.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ["/page-integration.js"],
    });
  });

  it("rejects activation on privileged browser pages", async () => {
    const dependencies = createDependencies();
    dependencies.tabs.query = vi.fn(() =>
      Promise.resolve([{ id: 7, url: "chrome://extensions" }]),
    );

    expect(
      await handleSettingsRequest(
        { kind: "page.activate-temporary", requestId: "request-2" },
        dependencies,
      ),
    ).toEqual({
      kind: "page.activation-result",
      requestId: "request-2",
      activated: false,
      error: "unsupported-page",
    });
    expect(dependencies.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("grants and reconstructs exact persistent origin access", async () => {
    const dependencies = createDependencies();
    let granted = false;
    dependencies.permissions.contains = vi.fn(() => Promise.resolve(granted));
    dependencies.permissions.request = vi.fn(() => {
      granted = true;
      return Promise.resolve(true);
    });

    const response = await handleSettingsRequest(
      { kind: "page.grant-persistent", requestId: "grant" },
      dependencies,
    );

    expect(response).toEqual({
      kind: "page.permission-result",
      requestId: "grant",
      granted: true,
      activated: true,
      origin: "https://example.com/*",
    });
    expect(dependencies.permissions.request).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual(["https://example.com/*"]);
    expect(dependencies.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ["/page-integration.js"],
    });
  });

  it("configures an origin already granted by the popup user gesture", async () => {
    const dependencies = createDependencies();

    await expect(
      handleSettingsRequest(
        { kind: "page.grant-persistent", requestId: "pre-granted" },
        dependencies,
      ),
    ).resolves.toMatchObject({
      kind: "page.permission-result",
      requestId: "pre-granted",
      granted: true,
      activated: true,
      origin: "https://example.com/*",
    });
    expect(dependencies.permissions.request).not.toHaveBeenCalled();
  });

  it("does not change settings when persistent permission is denied", async () => {
    const dependencies = createDependencies();
    dependencies.permissions.contains = vi.fn(() => Promise.resolve(false));
    dependencies.permissions.request = vi.fn(() => Promise.resolve(false));

    await expect(
      handleSettingsRequest(
        { kind: "page.grant-persistent", requestId: "denied" },
        dependencies,
      ),
    ).resolves.toEqual({
      kind: "page.permission-result",
      requestId: "denied",
      granted: false,
      error: "permission-denied",
    });
    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual([]);
    expect(dependencies.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("rolls back a newly granted permission when injection fails", async () => {
    const dependencies = createDependencies();
    dependencies.permissions.contains = vi.fn(() => Promise.resolve(false));
    dependencies.scripting.executeScript = vi.fn(() =>
      Promise.reject(new Error("Tab closed")),
    );

    await expect(
      handleSettingsRequest(
        { kind: "page.grant-persistent", requestId: "inject-failure" },
        dependencies,
      ),
    ).resolves.toEqual({
      kind: "page.permission-result",
      requestId: "inject-failure",
      granted: false,
      activated: false,
      origin: "https://example.com/*",
      error: "injection-failed",
    });
    expect(dependencies.permissions.remove).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual([]);
    expect(
      dependencies.scripting.registerContentScripts,
    ).not.toHaveBeenCalled();
  });

  it("deactivates and rolls back when persistent registration fails", async () => {
    const dependencies = createDependencies();
    let granted = false;
    dependencies.permissions.contains = vi.fn(() => Promise.resolve(granted));
    dependencies.permissions.request = vi.fn(() => {
      granted = true;
      return Promise.resolve(true);
    });
    dependencies.permissions.remove = vi.fn(() => {
      granted = false;
      return Promise.resolve(true);
    });
    dependencies.scripting.registerContentScripts = vi.fn(() =>
      Promise.reject(new Error("Registration unavailable")),
    );

    await expect(
      handleSettingsRequest(
        { kind: "page.grant-persistent", requestId: "config-failure" },
        dependencies,
      ),
    ).resolves.toEqual({
      kind: "page.permission-result",
      requestId: "config-failure",
      granted: false,
      activated: false,
      origin: "https://example.com/*",
      error: "configuration-failed",
    });
    expect(dependencies.tabs.sendMessage).toHaveBeenCalledWith(7, {
      kind: "page.deactivate",
    });
    expect(dependencies.permissions.remove).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual([]);
  });

  it("revokes normalized persistent origin access and stored state", async () => {
    const dependencies = createDependencies({
      ...DEFAULT_SETTINGS,
      activationMode: "persistent",
      persistentOrigins: ["https://example.com/*"],
    });
    dependencies.permissions.contains = vi.fn(() => Promise.resolve(false));

    await expect(
      handleSettingsRequest(
        {
          kind: "page.revoke-persistent",
          requestId: "revoke",
          origin: "https://example.com/page",
        },
        dependencies,
      ),
    ).resolves.toEqual({
      kind: "page.permission-result",
      requestId: "revoke",
      granted: false,
      origin: "https://example.com/*",
    });
    expect(dependencies.permissions.remove).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
    expect(
      (dependencies.stored.settings as typeof DEFAULT_SETTINGS)
        .persistentOrigins,
    ).toEqual([]);
  });

  it("deactivates only the active tab content script", async () => {
    const dependencies = createDependencies();

    await expect(
      handleSettingsRequest(
        { kind: "page.deactivate-current", requestId: "deactivate" },
        dependencies,
      ),
    ).resolves.toEqual({
      kind: "page.deactivation-result",
      requestId: "deactivate",
      deactivated: true,
    });
    expect(dependencies.tabs.sendMessage).toHaveBeenCalledWith(7, {
      kind: "page.deactivate",
    });
  });

  it("reports explicit inactive content scripts", async () => {
    const dependencies = createDependencies();
    dependencies.tabs.sendMessage = vi.fn(() =>
      Promise.reject(new Error("No receiver")),
    );

    await expect(
      handleSettingsRequest(
        { kind: "page.deactivate-current", requestId: "inactive" },
        dependencies,
      ),
    ).resolves.toEqual({
      kind: "page.deactivation-result",
      requestId: "inactive",
      deactivated: false,
      error: "not-active",
    });
  });
});
