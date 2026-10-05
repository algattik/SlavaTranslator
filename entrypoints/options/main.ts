import type {
  RuntimeRequest,
  RuntimeResponse,
} from "../../src/contracts/messages";
import {
  DEFINITION_EDITIONS,
  type DefinitionEdition,
} from "../../src/contracts/definition";
import type { Settings } from "../../src/settings/settings";
import {
  UI_LOCALES,
  localeDirection,
  message,
  resolveUiLocale,
  type MessageKey,
  type UiLocale,
  type UiLocalePreference,
} from "../../src/i18n/catalog";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing options element: ${id}`);
  }
  return element as T;
};

const send = async (
  request: RuntimeRequest,
): Promise<RuntimeResponse | undefined> => browser.runtime.sendMessage(request);
const requestId = () => crypto.randomUUID();

let settings: Settings;
let diagnostics: Extract<RuntimeResponse, { kind: "diagnostics.result" }>;
let saveQueue = Promise.resolve();
let saveRevision = 0;
let locale: UiLocale = "en";

const LANGUAGE_AUTONYMS: Readonly<Record<string, string>> = {
  en: "English",
  ru: "Русский",
  uk: "Українська",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  pt: "Português",
  "pt-BR": "Português (Brasil)",
  zh: "中文",
  "zh-CN": "中文（简体）",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  hi: "हिन्दी",
  he: "עברית",
  pl: "Polski",
  ro: "Română",
  tr: "Türkçe",
  it: "Italiano",
  kk: "Қазақша",
  lv: "Latviešu",
  et: "Eesti",
  lt: "Lietuvių",
};

function languageAutonym(language: string): string {
  return LANGUAGE_AUTONYMS[language] ?? language;
}

function languageLocale(language: string): string {
  return language === "pt" ? "pt-BR" : language === "zh" ? "zh-CN" : language;
}

async function load(): Promise<void> {
  const [settingsResponse, diagnosticsResponse] = await Promise.all([
    send({ kind: "settings.get", requestId: requestId() }),
    send({ kind: "diagnostics.get", requestId: requestId() }),
  ]);
  if (
    settingsResponse?.kind !== "settings.result" ||
    diagnosticsResponse?.kind !== "diagnostics.result"
  ) {
    throw new Error("Slava settings are unavailable");
  }
  settings = settingsResponse.settings;
  diagnostics = diagnosticsResponse;
  render();
}

function render(): void {
  locale = resolveUiLocale(
    settings.interfaceLocale,
    browser.i18n.getUILanguage(),
  );
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection(locale);
  document.title = message(locale, "settingsTitle");
  applyStaticCopy();
  populateLanguageOptions();
  populateEditionList();
  byId<HTMLSelectElement>("interface-locale").value = settings.interfaceLocale;
  byId<HTMLInputElement>("stress-marks").checked =
    settings.features.stressMarks;
  byId<HTMLInputElement>("definition-popups").checked =
    settings.features.definitionPopups;
  byId<HTMLInputElement>("reduced-motion").checked =
    settings.accessibility.reducedMotion;
  byId<HTMLInputElement>("high-contrast").checked =
    settings.accessibility.highContrast;
  byId<HTMLSelectElement>("font-scale").value =
    settings.accessibility.fontScale;
  byId<HTMLInputElement>("diagnostics-enabled").checked =
    settings.diagnosticsEnabled;

  const origins = byId("origins");
  origins.replaceChildren();
  if (settings.persistentOrigins.length === 0) {
    origins.textContent = message(locale, "noPersistentAccess");
  }
  for (const origin of settings.persistentOrigins) {
    const row = document.createElement("div");
    row.className = "origin";
    const code = document.createElement("code");
    code.textContent = origin;
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.textContent = message(locale, "revoke");
    revoke.addEventListener("click", () => void revokeOrigin(origin));
    row.append(code, revoke);
    origins.append(row);
  }

  const container = byId("diagnostics");
  container.replaceChildren();
  const list = document.createElement("dl");
  appendDiagnostic(
    list,
    message(locale, "packageVersion"),
    diagnostics.packageVersion,
  );
  appendDiagnostic(
    list,
    message(locale, "localIntegrity"),
    diagnostics.localIntegrity,
  );
  appendDiagnostic(
    list,
    message(locale, "lastDefinitionError"),
    diagnostics.lastDefinitionError ?? message(locale, "none"),
  );
  appendDiagnostic(
    list,
    message(locale, "wiktionaryHosts"),
    diagnostics.wiktionaryHosts.join(", "),
  );
  if (diagnostics.local !== undefined) {
    appendDiagnostic(
      list,
      message(locale, "stressIndex"),
      `${diagnostics.local.stress.snapshotDate}; ${diagnostics.local.stress.artifactDigest}`,
    );
    appendDiagnostic(
      list,
      message(locale, "morphologyIndex"),
      `${diagnostics.local.morphology.snapshotDate}; ${diagnostics.local.morphology.artifactDigest}`,
    );
    if (settings.diagnosticsEnabled) {
      appendDiagnostic(
        list,
        message(locale, "lookupCache"),
        message(locale, "cacheSummary", {
          entries: diagnostics.local.cacheEntries,
          hits: diagnostics.local.cacheHits,
          misses: diagnostics.local.cacheMisses,
        }),
      );
    }
  }
  container.append(list);
}

function applyStaticCopy(): void {
  const copy: Array<[string, MessageKey]> = [
    ["settings-title", "settingsTitle"],
    ["settings-intro", "settingsIntro"],
    ["features-legend", "features"],
    ["stress-marks-label", "showStress"],
    ["definition-popups-label", "showDefinitions"],
    ["definitions-legend", "definitions"],
    ["edition-label", "lookupLanguages"],
    ["edition-help", "fallbackOrder"],
    ["interface-legend", "interfaceLanguage"],
    ["interface-locale-label", "interfaceLanguage"],
    ["accessibility-legend", "accessibility"],
    ["reduced-motion-label", "reduceMotion"],
    ["high-contrast-label", "increaseContrast"],
    ["font-scale-label", "definitionTextSize"],
    ["diagnostics-enabled-label", "showDiagnostics"],
    ["access-heading", "persistentAccess"],
    ["access-help", "persistentHelp"],
    ["diagnostics-heading", "localDiagnostics"],
    ["export-diagnostics", "exportDiagnostics"],
    ["export-help", "exportHelp"],
  ];
  for (const [id, key] of copy) {
    byId(id).textContent = message(locale, key);
  }
  const sizeOptions = byId<HTMLSelectElement>("font-scale").options;
  for (const option of Array.from(sizeOptions)) {
    option.textContent = message(
      locale,
      option.value as "small" | "medium" | "large",
    );
  }
}

function populateLanguageOptions(): void {
  const select = byId<HTMLSelectElement>("interface-locale");
  select.replaceChildren();
  select.add(new Option(message(locale, "automaticLanguage"), "auto"));
  for (const value of UI_LOCALES) {
    const option = new Option(languageAutonym(value), value);
    option.lang = languageLocale(value);
    option.dir = "auto";
    select.add(option);
  }
}

function populateEditionList(): void {
  const list = byId<HTMLOListElement>("edition-list");
  list.replaceChildren();
  const selected = new Set(settings.definitionEditions);
  const ordered = [
    ...settings.definitionEditions,
    ...DEFINITION_EDITIONS.filter((edition) => !selected.has(edition)),
  ];
  for (const edition of ordered) {
    const item = document.createElement("li");
    item.className = "edition";
    item.dataset.edition = edition;
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(edition);
    checkbox.value = edition;
    checkbox.addEventListener("change", () => {
      if (
        !checkbox.checked &&
        list.querySelectorAll<HTMLInputElement>("input:checked").length === 0
      ) {
        checkbox.checked = true;
        byId("settings-status").textContent = message(
          locale,
          "atLeastOneDefinitionLanguage",
        );
        return;
      }
      queueSettingsSave();
    });
    const name = document.createElement("span");
    name.lang = languageLocale(edition);
    name.dir = "auto";
    name.textContent = languageAutonym(edition);
    label.append(checkbox, " ", name);
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.setAttribute("aria-label", message(locale, "moveUp"));
    const selectedIndex = settings.definitionEditions.indexOf(edition);
    up.disabled = !checkbox.checked || selectedIndex <= 0;
    up.addEventListener("click", () => {
      const previous = item.previousElementSibling;
      if (previous !== null) {
        list.insertBefore(item, previous);
        queueSettingsSave();
      }
    });
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.setAttribute("aria-label", message(locale, "moveDown"));
    down.disabled =
      !checkbox.checked ||
      selectedIndex === settings.definitionEditions.length - 1;
    down.addEventListener("click", () => {
      const next = item.nextElementSibling;
      if (next !== null) {
        list.insertBefore(next, item);
        queueSettingsSave();
      }
    });
    item.append(label, up, down);
    list.append(item);
  }
}

function appendDiagnostic(
  list: HTMLDListElement,
  label: string,
  value: string,
) {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  list.append(term, description);
}

async function revokeOrigin(origin: string): Promise<void> {
  const response = await send({
    kind: "page.revoke-persistent",
    requestId: requestId(),
    origin,
  });
  if (response?.kind === "page.permission-result") {
    settings = {
      ...settings,
      persistentOrigins: settings.persistentOrigins.filter(
        (value) => value !== origin,
      ),
    };
    render();
  }
}

function readFormSettings(): Settings {
  return {
    ...settings,
    interfaceLocale: byId<HTMLSelectElement>("interface-locale")
      .value as UiLocalePreference,
    definitionEditions: Array.from(
      byId("edition-list").querySelectorAll<HTMLInputElement>("input:checked"),
      (input) => input.value as DefinitionEdition,
    ),
    features: {
      stressMarks: byId<HTMLInputElement>("stress-marks").checked,
      definitionPopups: byId<HTMLInputElement>("definition-popups").checked,
    },
    accessibility: {
      reducedMotion: byId<HTMLInputElement>("reduced-motion").checked,
      highContrast: byId<HTMLInputElement>("high-contrast").checked,
      fontScale: byId<HTMLSelectElement>("font-scale")
        .value as Settings["accessibility"]["fontScale"],
    },
    diagnosticsEnabled: byId<HTMLInputElement>("diagnostics-enabled").checked,
  };
}

function queueSettingsSave(): void {
  const revision = ++saveRevision;
  const updated = readFormSettings();
  byId("settings-status").textContent = message(locale, "saving");
  saveQueue = saveQueue
    .then(async () => {
      const response = await send({
        kind: "settings.update",
        requestId: requestId(),
        settings: updated,
      });
      if (response?.kind !== "settings.result") {
        throw new Error("Settings update returned an invalid response");
      }
      settings = response.settings;
      if (revision === saveRevision) {
        render();
        byId("settings-status").textContent = message(locale, "saved");
      }
    })
    .catch((error: unknown) => {
      console.error("Failed to save Slava options", error);
      if (revision === saveRevision) {
        byId("settings-status").textContent = message(locale, "saveFailed");
      }
    });
}

for (const id of [
  "interface-locale",
  "stress-marks",
  "definition-popups",
  "reduced-motion",
  "high-contrast",
  "font-scale",
  "diagnostics-enabled",
]) {
  byId(id).addEventListener("change", queueSettingsSave);
}

byId<HTMLButtonElement>("export-diagnostics").addEventListener("click", () => {
  const exportValue = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    settings: {
      definitionEditions: settings.definitionEditions,
      interfaceLocale: settings.interfaceLocale,
      activationMode: settings.activationMode,
      features: settings.features,
      accessibility: settings.accessibility,
      diagnosticsEnabled: settings.diagnosticsEnabled,
    },
    diagnostics,
  };
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(exportValue, null, 2)}\n`], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "slava-diagnostics.json";
  link.click();
  URL.revokeObjectURL(url);
});

void load().catch((error: unknown) => {
  console.error("Failed to load Slava options", error);
  byId("settings-status").textContent = message(locale, "loadFailed");
});
