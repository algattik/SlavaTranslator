import type { DefinitionEdition } from "./definition";

export const DEFINITION_FIXTURE_SCHEMA_VERSION = 1;

export interface DefinitionFixtureMetadata {
  schemaVersion: typeof DEFINITION_FIXTURE_SCHEMA_VERSION;
  edition: DefinitionEdition;
  requestedTitle: string;
  resolvedTitle: string | null;
  revisionId: number | null;
  retrievedAt: string;
  sourceUrl: string;
  license: string;
  scenario:
    | "usable"
    | "missing"
    | "redirect"
    | "malformed"
    | "hostile"
    | "oversized"
    | "no-russian-entry"
    | "timeout"
    | "aborted"
    | "wrong-origin"
    | "wrong-content-type";
}
