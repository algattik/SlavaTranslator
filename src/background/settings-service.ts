import type { RuntimeRequest, RuntimeResponse } from "../contracts/messages";
import { WIKTIONARY_HOSTS } from "../config/wiktionary-hosts";
import {
  filterGrantedPageOrigins,
  listGrantedPageOrigins,
  removePageOrigin,
  requestPageOrigin,
  type PagePermissionApi,
} from "../settings/page-permissions";
import {
  loadSettings,
  normalizePageOrigin,
  saveSettings,
  type SettingsStorage,
} from "../settings/settings";

export const PERSISTENT_SCRIPT_ID = "slava-persistent-page-integration";
const DEFINITION_ORIGINS = new Set(
  WIKTIONARY_HOSTS.map((host) => new URL(host).origin),
);

export interface SettingsServiceDependencies {
  permissions: PagePermissionApi;
  scripting: {
    executeScript(options: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown>;
    getRegisteredContentScripts(filter: {
      ids: string[];
    }): Promise<Array<{ id: string }>>;
    registerContentScripts(
      scripts: Array<{
        id: string;
        js: string[];
        matches: string[];
        persistAcrossSessions: boolean;
        runAt: "document_idle";
      }>,
    ): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  };
  storage: SettingsStorage;
  temporaryTabs: {
    activate(tabId: number, url: string): Promise<void>;
    deactivate(tabId: number): Promise<void>;
  };
  tabs: {
    query(query: {
      active: boolean;
      currentWindow: boolean;
    }): Promise<Array<{ id?: number | undefined; url?: string | undefined }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
}

export async function synchronizePersistentRegistration(
  dependencies: SettingsServiceDependencies,
): Promise<void> {
  const settings = await loadSettings(dependencies.storage);
  const configuredOrigins = await filterGrantedPageOrigins(
    dependencies.permissions,
    settings.persistentOrigins,
  );
  const grantedPageOrigins = (
    await listGrantedPageOrigins(dependencies.permissions)
  ).filter((origin) => !DEFINITION_ORIGINS.has(new URL(origin).origin));
  const origins = [
    ...new Set([...configuredOrigins, ...grantedPageOrigins]),
  ].sort();
  if (
    origins.length !== settings.persistentOrigins.length ||
    origins.some(
      (origin, index) => origin !== settings.persistentOrigins[index],
    )
  ) {
    await saveSettings(dependencies.storage, {
      ...settings,
      persistentOrigins: origins,
    });
  }

  const registered =
    (
      await dependencies.scripting.getRegisteredContentScripts({
        ids: [PERSISTENT_SCRIPT_ID],
      })
    ).length > 0;
  if (registered) {
    await dependencies.scripting.unregisterContentScripts({
      ids: [PERSISTENT_SCRIPT_ID],
    });
  }
  if (origins.length > 0) {
    await dependencies.scripting.registerContentScripts([
      {
        id: PERSISTENT_SCRIPT_ID,
        js: ["/page-integration.js"],
        matches: origins,
        persistAcrossSessions: true,
        runAt: "document_idle",
      },
    ]);
  }
}

export async function handleSettingsRequest(
  request: RuntimeRequest,
  dependencies: SettingsServiceDependencies,
): Promise<RuntimeResponse | undefined> {
  if (request.kind === "settings.get") {
    return {
      kind: "settings.result",
      requestId: request.requestId,
      settings: await loadSettings(dependencies.storage),
    };
  }
  if (request.kind === "settings.update") {
    const settings = await saveSettings(dependencies.storage, request.settings);
    await synchronizePersistentRegistration(dependencies);
    return {
      kind: "settings.result",
      requestId: request.requestId,
      settings,
    };
  }
  if (request.kind === "page.activate-temporary") {
    const [tab] = await dependencies.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) {
      return {
        kind: "page.activation-result",
        requestId: request.requestId,
        activated: false,
        error: "no-active-tab",
      };
    }
    if (tab.url === undefined || normalizeInjectableUrl(tab.url) === null) {
      return {
        kind: "page.activation-result",
        requestId: request.requestId,
        activated: false,
        error: "unsupported-page",
      };
    }
    try {
      await dependencies.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/page-integration.js"],
      });
      await dependencies.temporaryTabs.activate(tab.id, tab.url);
      return {
        kind: "page.activation-result",
        requestId: request.requestId,
        activated: true,
      };
    } catch (error) {
      console.error("Temporary Slava activation failed", {
        tabId: tab.id,
        error,
      });
      return {
        kind: "page.activation-result",
        requestId: request.requestId,
        activated: false,
        error: "injection-failed",
      };
    }
  }
  if (request.kind === "page.grant-persistent") {
    const [tab] = await dependencies.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) {
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: false,
        error: "no-active-tab",
      };
    }
    if (tab.url === undefined || normalizeInjectableUrl(tab.url) === null) {
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: false,
        error: "unsupported-page",
      };
    }
    const normalizedOrigin = normalizePageOrigin(tab.url);
    if (normalizedOrigin === null) {
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: false,
        error: "unsupported-page",
      };
    }
    const previousSettings = await loadSettings(dependencies.storage);
    const permissionWasGranted = await dependencies.permissions.contains({
      origins: [normalizedOrigin],
    });
    const origin = permissionWasGranted
      ? normalizedOrigin
      : await requestPageOrigin(dependencies.permissions, tab.url);
    if (origin === null) {
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: false,
        error: "permission-denied",
      };
    }
    let injected = false;
    try {
      await dependencies.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/page-integration.js"],
      });
      injected = true;
      await dependencies.temporaryTabs.deactivate(tab.id);
      await saveSettings(dependencies.storage, {
        ...previousSettings,
        activationMode: "persistent",
        persistentOrigins: [
          ...new Set([...previousSettings.persistentOrigins, origin]),
        ],
      });
      await synchronizePersistentRegistration(dependencies);
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: true,
        activated: true,
        origin,
      };
    } catch (error) {
      const failure = injected ? "configuration-failed" : "injection-failed";
      console.error("Persistent Slava activation failed", {
        error,
        origin,
        tabId: tab.id,
      });
      try {
        if (injected) {
          await dependencies.tabs.sendMessage(tab.id, {
            kind: "page.deactivate",
          });
        }
        await saveSettings(dependencies.storage, previousSettings);
        await synchronizePersistentRegistration(dependencies);
        if (!permissionWasGranted) {
          await removePageOrigin(dependencies.permissions, origin);
        }
      } catch (rollbackError) {
        console.error("Persistent Slava activation rollback failed", {
          error: rollbackError,
          origin,
          tabId: tab.id,
        });
      }
      const currentSettings = await loadSettings(dependencies.storage);
      const remainsConfigured =
        currentSettings.persistentOrigins.includes(origin) &&
        (await dependencies.permissions.contains({ origins: [origin] }));
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: remainsConfigured,
        activated: false,
        origin,
        error: failure,
      };
    }
  }
  if (request.kind === "page.revoke-persistent") {
    const origin = normalizePageOrigin(request.origin);
    if (origin === null) {
      return {
        kind: "page.permission-result",
        requestId: request.requestId,
        granted: false,
        origin: request.origin,
      };
    }
    await removePageOrigin(dependencies.permissions, origin);
    const settings = await loadSettings(dependencies.storage);
    await saveSettings(dependencies.storage, {
      ...settings,
      persistentOrigins: settings.persistentOrigins.filter(
        (savedOrigin) => savedOrigin !== origin,
      ),
    });
    await synchronizePersistentRegistration(dependencies);
    return {
      kind: "page.permission-result",
      requestId: request.requestId,
      granted: false,
      origin,
    };
  }
  if (request.kind === "page.deactivate-current") {
    const [tab] = await dependencies.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) {
      return {
        kind: "page.deactivation-result",
        requestId: request.requestId,
        deactivated: false,
        error: "no-active-tab",
      };
    }
    try {
      await dependencies.temporaryTabs.deactivate(tab.id);
      await dependencies.tabs.sendMessage(tab.id, {
        kind: "page.deactivate",
      });
      return {
        kind: "page.deactivation-result",
        requestId: request.requestId,
        deactivated: true,
      };
    } catch {
      return {
        kind: "page.deactivation-result",
        requestId: request.requestId,
        deactivated: false,
        error: "not-active",
      };
    }
  }
  return undefined;
}

function normalizeInjectableUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
