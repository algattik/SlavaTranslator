import {
  handleSettingsRequest,
  synchronizePersistentRegistration,
  type SettingsServiceDependencies,
} from "../src/background/settings-service";
import {
  handleLocalLookupRequest,
  LocalLookupService,
} from "../src/background/local-lookup-service";
import { DefinitionService } from "../src/background/definition-service";
import { TemporaryTabService } from "../src/background/temporary-tab-service";
import {
  isRuntimeRequest,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../src/contracts/messages";
import { MediaWikiClient } from "../src/definitions/mediawiki-client";
import { OffscreenDefinitionParser } from "../src/definitions/offscreen-parser";
import { WIKTIONARY_HOSTS } from "../src/config/wiktionary-hosts";
import { normalizePageOrigin } from "../src/settings/settings";

export default defineBackground({
  type: "module",
  main() {
    const temporaryTabs = new TemporaryTabService({
      storage: {
        get: (key) => browser.storage.session.get(key),
        set: (values) => browser.storage.session.set(values),
      },
      executeScript: (tabId) =>
        browser.scripting.executeScript({
          target: { tabId },
          files: ["/page-integration.js"],
        }),
    });
    const dependencies: SettingsServiceDependencies = {
      permissions: {
        contains: (permissions) => browser.permissions.contains(permissions),
        getAll: () => browser.permissions.getAll(),
        remove: (permissions) => browser.permissions.remove(permissions),
        request: (permissions) => browser.permissions.request(permissions),
      },
      scripting: {
        executeScript: (options) =>
          browser.scripting.executeScript({
            target: options.target,
            files: options.files as ["/page-integration.js"],
          }),
        getRegisteredContentScripts: (filter) =>
          browser.scripting.getRegisteredContentScripts(filter),
        registerContentScripts: (scripts) =>
          browser.scripting.registerContentScripts(
            scripts.map((script) => ({
              ...script,
              js: script.js as ["/page-integration.js"],
            })),
          ),
        unregisterContentScripts: (filter) =>
          browser.scripting.unregisterContentScripts(filter),
      },
      storage: {
        get: (key) => browser.storage.local.get(key),
        set: (values) => browser.storage.local.set(values),
      },
      temporaryTabs,
      tabs: {
        query: (query) => browser.tabs.query(query),
        sendMessage: (tabId, message) =>
          browser.tabs.sendMessage(tabId, message),
      },
    };
    const localLookupService = LocalLookupService.create({
      morphologyBaseUrl: new URL(
        ".",
        browser.runtime.getURL("/indexes/morphology/metadata.json"),
      ).href,
      stressBaseUrl: new URL(
        ".",
        browser.runtime.getURL("/indexes/stress/metadata.json"),
      ).href,
    });
    const offscreenApi = (
      globalThis as unknown as {
        chrome: {
          offscreen: {
            createDocument(options: {
              url: string;
              reasons: ["DOM_PARSER"];
              justification: string;
            }): Promise<void>;
            hasDocument(): Promise<boolean>;
          };
        };
      }
    ).chrome.offscreen;
    const definitionService = new DefinitionService(
      new MediaWikiClient(
        new OffscreenDefinitionParser(
          {
            getURL: (path) => browser.runtime.getURL(path),
            sendMessage: (message) => browser.runtime.sendMessage(message),
          },
          offscreenApi,
        ),
      ),
    );
    browser.runtime.onMessage.addListener(
      (message: unknown, sender, sendResponse) => {
        if (!isRuntimeRequest(message)) {
          return false;
        }
        void (async () => {
          const request: RuntimeRequest = message;
          return (
            (await handleSettingsRequest(request, dependencies)) ??
            (await handleLocalLookupRequest(request, localLookupService)) ??
            (request.kind === "diagnostics.get"
              ? await createDiagnosticsResponse(
                  request.requestId,
                  localLookupService,
                  definitionService,
                )
              : undefined) ??
            (await definitionService.handle(request, sender.tab?.id))
          );
        })().then(sendResponse, (error: unknown) => {
          console.error("Slava background request failed", error);
          sendResponse(undefined);
        });

        async function createDiagnosticsResponse(
          requestId: string,
          localLookupService: Promise<LocalLookupService>,
          definitionService: DefinitionService,
        ): Promise<RuntimeResponse> {
          try {
            const local = (await localLookupService).diagnostics;
            return {
              kind: "diagnostics.result",
              requestId,
              packageVersion: browser.runtime.getManifest().version,
              wiktionaryHosts: WIKTIONARY_HOSTS.map(
                (host) => new URL(host).origin,
              ),
              lastDefinitionError: definitionService.diagnostics.lastError,
              localIntegrity: "verified",
              local,
            };
          } catch (error) {
            console.error("Local diagnostics unavailable", {
              error,
              requestId,
            });
            return {
              kind: "diagnostics.result",
              requestId,
              packageVersion: browser.runtime.getManifest().version,
              wiktionaryHosts: WIKTIONARY_HOSTS.map(
                (host) => new URL(host).origin,
              ),
              lastDefinitionError: definitionService.diagnostics.lastError,
              localIntegrity: "failed",
            };
          }
        }
        return true;
      },
    );
    browser.runtime.onInstalled.addListener(() => {
      console.info("Slava Russian Dictionary installed");
    });
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status !== "complete" || tab.url === undefined) {
        return;
      }
      void temporaryTabs.reinject(tabId, tab.url).catch((error: unknown) => {
        console.error("Temporary Slava reinjection failed", {
          error,
          tabId,
        });
      });
    });
    browser.tabs.onRemoved.addListener((tabId) => {
      void temporaryTabs.deactivate(tabId).catch((error: unknown) => {
        console.error("Temporary Slava cleanup failed", { error, tabId });
      });
    });
    const definitionOrigins = new Set(
      WIKTIONARY_HOSTS.map((host) => new URL(host).origin),
    );
    browser.permissions.onAdded.addListener(({ origins = [] }) => {
      const pageOriginAdded = origins.some((origin) => {
        const normalized = normalizePageOrigin(origin);
        return (
          normalized !== null &&
          !definitionOrigins.has(new URL(normalized).origin)
        );
      });
      if (!pageOriginAdded) {
        return;
      }
      void synchronizePersistentRegistration(dependencies).catch(
        (error: unknown) => {
          console.error("Granted Slava origin registration failed", error);
        },
      );
    });
    void synchronizePersistentRegistration(dependencies).catch((error) => {
      console.error("Failed to restore persistent Slava origins", error);
    });
  },
});
