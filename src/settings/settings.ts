import {
  DEFINITION_EDITIONS,
  type DefinitionEdition,
} from "../contracts/definition";
import { UI_LOCALES, type UiLocalePreference } from "../i18n/catalog";

export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_STORAGE_KEY = "settings";

export interface Settings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  interfaceLocale: UiLocalePreference;
  definitionEditions: DefinitionEdition[];
  activationMode: "temporary" | "persistent";
  features: {
    stressMarks: boolean;
    definitionPopups: boolean;
  };
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    fontScale: "small" | "medium" | "large";
  };
  diagnosticsEnabled: boolean;
  persistentOrigins: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  interfaceLocale: "auto",
  definitionEditions: ["en"],
  activationMode: "temporary",
  features: {
    stressMarks: true,
    definitionPopups: true,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    fontScale: "medium",
  },
  diagnosticsEnabled: false,
  persistentOrigins: [],
};

export interface SettingsStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export function normalizePageOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

function isDefinitionEdition(value: unknown): value is DefinitionEdition {
  return (
    typeof value === "string" &&
    (DEFINITION_EDITIONS as readonly string[]).includes(value)
  );
}

function isUiLocalePreference(value: unknown): value is UiLocalePreference {
  return (
    value === "auto" ||
    (typeof value === "string" &&
      (UI_LOCALES as readonly string[]).includes(value))
  );
}

export function parseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  const candidate = value as Partial<Settings> & {
    definitionEdition?: unknown;
  };
  const accessibility =
    typeof candidate.accessibility === "object" &&
    candidate.accessibility !== null
      ? candidate.accessibility
      : DEFAULT_SETTINGS.accessibility;
  const features =
    typeof candidate.features === "object" && candidate.features !== null
      ? candidate.features
      : DEFAULT_SETTINGS.features;
  const persistentOrigins = Array.isArray(candidate.persistentOrigins)
    ? [
        ...new Set(
          candidate.persistentOrigins
            .map((origin) =>
              typeof origin === "string" ? normalizePageOrigin(origin) : null,
            )
            .filter((origin): origin is string => origin !== null),
        ),
      ].sort()
    : [];

  const selectedDefinitionEditions: DefinitionEdition[] = Array.isArray(
    candidate.definitionEditions,
  )
    ? [...new Set(candidate.definitionEditions.filter(isDefinitionEdition))]
    : isDefinitionEdition(candidate.definitionEdition)
      ? candidate.definitionEdition === "en"
        ? ["en"]
        : [candidate.definitionEdition, "en"]
      : DEFAULT_SETTINGS.definitionEditions;

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    interfaceLocale: isUiLocalePreference(candidate.interfaceLocale)
      ? candidate.interfaceLocale
      : DEFAULT_SETTINGS.interfaceLocale,
    definitionEditions:
      selectedDefinitionEditions.length > 0
        ? selectedDefinitionEditions
        : DEFAULT_SETTINGS.definitionEditions,
    activationMode:
      candidate.activationMode === "persistent"
        ? "persistent"
        : DEFAULT_SETTINGS.activationMode,
    features: {
      stressMarks:
        typeof features.stressMarks === "boolean"
          ? features.stressMarks
          : DEFAULT_SETTINGS.features.stressMarks,
      definitionPopups:
        typeof features.definitionPopups === "boolean"
          ? features.definitionPopups
          : DEFAULT_SETTINGS.features.definitionPopups,
    },
    accessibility: {
      reducedMotion:
        typeof accessibility.reducedMotion === "boolean"
          ? accessibility.reducedMotion
          : DEFAULT_SETTINGS.accessibility.reducedMotion,
      highContrast:
        typeof accessibility.highContrast === "boolean"
          ? accessibility.highContrast
          : DEFAULT_SETTINGS.accessibility.highContrast,
      fontScale:
        accessibility.fontScale === "small" ||
        accessibility.fontScale === "large"
          ? accessibility.fontScale
          : DEFAULT_SETTINGS.accessibility.fontScale,
    },
    diagnosticsEnabled:
      typeof candidate.diagnosticsEnabled === "boolean"
        ? candidate.diagnosticsEnabled
        : DEFAULT_SETTINGS.diagnosticsEnabled,
    persistentOrigins,
  };
}

export async function loadSettings(
  storage: SettingsStorage,
): Promise<Settings> {
  const stored = await storage.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(
  storage: SettingsStorage,
  settings: Settings,
): Promise<Settings> {
  const validated = parseSettings(settings);
  await storage.set({ [SETTINGS_STORAGE_KEY]: validated });
  return validated;
}
