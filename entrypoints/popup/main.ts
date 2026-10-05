import type {
  RuntimeRequest,
  RuntimeResponse,
} from "../../src/contracts/messages";
import {
  localeDirection,
  message,
  resolveUiLocale,
  type MessageKey,
  type UiLocale,
} from "../../src/i18n/catalog";
import { normalizePageOrigin } from "../../src/settings/settings";

const send = async (
  request: RuntimeRequest,
): Promise<RuntimeResponse | undefined> => browser.runtime.sendMessage(request);
const status = document.getElementById("status");
const alwaysButton = document.getElementById("always");
let locale: UiLocale = "en";
let persistentOrigin: string | null = null;
let persistentPermissionWasGranted = false;

if (alwaysButton instanceof HTMLButtonElement) {
  alwaysButton.disabled = true;
}

function setStatus(message: string): void {
  if (status !== null) {
    status.textContent = message;
  }
}

function updatePersistentButtonCopy(): void {
  if (alwaysButton instanceof HTMLButtonElement) {
    alwaysButton.textContent = message(
      locale,
      persistentPermissionWasGranted ? "disablePersistent" : "alwaysEnable",
    );
  }
}

function button(id: string, action: () => Promise<void>): void {
  document.getElementById(id)?.addEventListener("click", () => {
    void action().catch((error: unknown) => {
      console.error(`Slava popup action failed: ${id}`, error);
      setStatus(message(locale, "actionFailed"));
    });
  });
}

button("activate", async () => {
  const response = await send({
    kind: "page.activate-temporary",
    requestId: crypto.randomUUID(),
  });
  setStatus(
    response?.kind === "page.activation-result" && response.activated
      ? message(locale, "enabledTemporary")
      : message(locale, "pageCannotEnable"),
  );
});

button("always", async () => {
  if (persistentOrigin === null) {
    setStatus(message(locale, "persistentUnavailable"));
    return;
  }
  if (persistentPermissionWasGranted) {
    const response = await send({
      kind: "page.revoke-persistent",
      requestId: crypto.randomUUID(),
      origin: persistentOrigin,
    });
    if (response?.kind !== "page.permission-result" || response.granted) {
      setStatus(message(locale, "actionFailed"));
      return;
    }
    persistentPermissionWasGranted = false;
    updatePersistentButtonCopy();
    await send({
      kind: "page.deactivate-current",
      requestId: crypto.randomUUID(),
    });
    setStatus(message(locale, "disabled"));
    return;
  }
  const granted = await browser.permissions.request({
    origins: [persistentOrigin],
  });
  if (!granted) {
    setStatus(message(locale, "persistentDenied"));
    return;
  }
  if (!persistentPermissionWasGranted) {
    persistentPermissionWasGranted = true;
    updatePersistentButtonCopy();
    setStatus(message(locale, "persistentConfiguredReload"));
    return;
  }
  const response = await send({
    kind: "page.grant-persistent",
    requestId: crypto.randomUUID(),
  });
  if (response?.kind !== "page.permission-result") {
    setStatus(message(locale, "persistentUnavailable"));
  } else if (response.granted && response.activated) {
    setStatus(
      message(locale, "persistentGranted", {
        origin: response.origin ?? "this site",
      }),
    );
  } else if (response.granted) {
    setStatus(message(locale, "persistentConfiguredReload"));
  } else {
    setStatus(message(locale, "persistentDenied"));
  }
});

button("deactivate", async () => {
  const response = await send({
    kind: "page.deactivate-current",
    requestId: crypto.randomUUID(),
  });
  setStatus(
    response?.kind === "page.deactivation-result" && response.deactivated
      ? message(locale, "disabled")
      : message(locale, "notActive"),
  );
});

button("settings", async () => {
  await browser.runtime.openOptionsPage();
});

function applyCopy(): void {
  const copy: Array<[string, MessageKey]> = [
    ["app-name", "appName"],
    ["popup-intro", "popupIntro"],
    ["activate", "activateTemporary"],
    ["temporary-scope", "temporaryScope"],
    ["deactivate", "deactivate"],
    ["settings", "settingsAndDiagnostics"],
  ];
  for (const [id, key] of copy) {
    const element = document.getElementById(id);
    if (element !== null) {
      element.textContent = message(locale, key);
    }
  }
  updatePersistentButtonCopy();
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection(locale);
  document.title = message(locale, "appName");
}

void send({ kind: "settings.get", requestId: crypto.randomUUID() }).then(
  (response) => {
    if (response?.kind === "settings.result") {
      locale = resolveUiLocale(
        response.settings.interfaceLocale,
        browser.i18n.getUILanguage(),
      );
      applyCopy();
    }
  },
);

void browser.tabs
  .query({ active: true, currentWindow: true })
  .then(async ([tab]) => {
    persistentOrigin =
      typeof tab?.url === "string" ? normalizePageOrigin(tab.url) : null;
    if (persistentOrigin === null) {
      return;
    }
    persistentPermissionWasGranted = await browser.permissions.contains({
      origins: [persistentOrigin],
    });
    updatePersistentButtonCopy();
    if (alwaysButton instanceof HTMLButtonElement) {
      alwaysButton.disabled = false;
    }
  })
  .catch((error: unknown) => {
    console.error("Persistent Slava permission preflight failed", error);
  });
