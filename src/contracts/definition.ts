import { WIKTIONARY_HOSTS } from "../config/wiktionary-hosts";

export const DEFINITION_EDITIONS = [
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
] as const;

export type DefinitionEdition = (typeof DEFINITION_EDITIONS)[number];

export const DEFINITION_CONTRACT_VERSION = 2;
export const MAX_LEMMA_CODE_POINTS = 64;
export const MAX_DEFINITION_ENTRIES = 32;
export const MAX_SENSES_PER_ENTRY = 64;
export const MAX_SENSE_CODE_POINTS = 2_000;
export const DEFINITION_REQUEST_TIMEOUT_MS = 8_000;
export const DEFINITION_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export interface DefinitionRequest {
  contractVersion: typeof DEFINITION_CONTRACT_VERSION;
  requestId: string;
  lemma: string;
  editions: DefinitionEdition[];
}

export interface DefinitionEntry {
  partOfSpeech: string | null;
  senses: string[];
}

export interface DefinitionResult {
  contractVersion: typeof DEFINITION_CONTRACT_VERSION;
  requestId: string;
  requestedEdition: DefinitionEdition;
  resolvedEdition: DefinitionEdition;
  requestedLemma: string;
  resolvedTitle: string;
  revisionId: number;
  sourceUrl: string;
  entries: DefinitionEntry[];
  fallbackUsed: boolean;
  attribution: string;
}

export const DEFINITION_ERROR_CODES = [
  "offline",
  "timeout",
  "throttled",
  "missing",
  "no-russian-entry",
  "response-too-large",
  "unexpected-origin",
  "invalid-content-type",
  "invalid-response",
  "api-changed",
  "aborted",
] as const;

export type DefinitionErrorCode = (typeof DEFINITION_ERROR_CODES)[number];

export interface DefinitionFailure {
  contractVersion: typeof DEFINITION_CONTRACT_VERSION;
  requestId: string;
  code: DefinitionErrorCode;
  retryAfterSeconds?: number;
}

export type DefinitionResponse = DefinitionResult | DefinitionFailure;

const hostByEdition = Object.fromEntries(
  DEFINITION_EDITIONS.map((edition, index) => [
    edition,
    new URL(WIKTIONARY_HOSTS[index] ?? "").origin,
  ]),
) as Record<DefinitionEdition, string>;

export function getWiktionaryOrigin(edition: DefinitionEdition): string {
  return hostByEdition[edition];
}

export function isDefinitionEdition(
  value: unknown,
): value is DefinitionEdition {
  return (
    typeof value === "string" &&
    (DEFINITION_EDITIONS as readonly string[]).includes(value)
  );
}
