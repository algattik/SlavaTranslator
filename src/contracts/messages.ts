import {
  DEFINITION_CONTRACT_VERSION,
  DEFINITION_EDITIONS,
  type DefinitionErrorCode,
  type DefinitionRequest,
  type DefinitionResponse,
} from "./definition";
import type { MorphologyLookupResult, StressLookupResult } from "./local-index";
import type { Settings } from "../settings/settings";

export type RuntimeRequest =
  | {
      kind: "definition.lookup";
      payload: DefinitionRequest;
    }
  | {
      kind: "definition.cancel";
      requestId: string;
    }
  | {
      kind: "local.lookup";
      requestId: string;
      token: string;
    }
  | {
      kind: "local.lookup-batch";
      requestId: string;
      tokens: string[];
    }
  | {
      kind: "local.diagnostics";
      requestId: string;
    }
  | {
      kind: "settings.get";
      requestId: string;
    }
  | {
      kind: "settings.update";
      requestId: string;
      settings: Settings;
    }
  | {
      kind: "page.activate-temporary";
      requestId: string;
    }
  | {
      kind: "page.grant-persistent";
      requestId: string;
    }
  | {
      kind: "page.revoke-persistent";
      requestId: string;
      origin: string;
    }
  | {
      kind: "page.deactivate-current";
      requestId: string;
    }
  | {
      kind: "diagnostics.get";
      requestId: string;
    };

export type RuntimeResponse =
  | {
      kind: "definition.result";
      payload: DefinitionResponse;
    }
  | {
      kind: "local.result";
      requestId: string;
      morphology: MorphologyLookupResult;
      stress: StressLookupResult;
    }
  | {
      kind: "local.batch-result";
      requestId: string;
      results: Array<{
        token: string;
        morphology: MorphologyLookupResult;
        stress: StressLookupResult;
      }>;
    }
  | {
      kind: "local.failure";
      requestId: string;
      error: "invalid-token" | "index-unavailable";
    }
  | {
      kind: "local.diagnostics-result";
      requestId: string;
      cacheEntries: number;
      cacheHits: number;
      cacheMisses: number;
      morphology: {
        artifactDigest: `sha256:${string}`;
        snapshotDate: string;
        sourceRevision: string;
      };
      stress: {
        artifactDigest: `sha256:${string}`;
        snapshotDate: string;
        sourceRevision: string;
      };
    }
  | {
      kind: "settings.result";
      requestId: string;
      settings: Settings;
    }
  | {
      kind: "page.activation-result";
      requestId: string;
      activated: boolean;
      error?: "unsupported-page" | "no-active-tab" | "injection-failed";
    }
  | {
      kind: "page.permission-result";
      requestId: string;
      granted: boolean;
      activated?: boolean;
      origin?: string;
      error?:
        | "unsupported-page"
        | "no-active-tab"
        | "permission-denied"
        | "injection-failed"
        | "configuration-failed";
    }
  | {
      kind: "page.deactivation-result";
      requestId: string;
      deactivated: boolean;
      error?: "no-active-tab" | "not-active";
    }
  | {
      kind: "diagnostics.result";
      requestId: string;
      packageVersion: string;
      wiktionaryHosts: string[];
      lastDefinitionError: DefinitionErrorCode | null;
      localIntegrity: "verified" | "failed";
      local?: {
        cacheEntries: number;
        cacheHits: number;
        cacheMisses: number;
        morphology: {
          artifactDigest: `sha256:${string}`;
          snapshotDate: string;
          sourceRevision: string;
        };
        stress: {
          artifactDigest: `sha256:${string}`;
          snapshotDate: string;
          sourceRevision: string;
        };
      };
    };

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  const candidate = value as {
    kind: unknown;
    requestId?: unknown;
    payload?: unknown;
  };
  if (typeof candidate.kind !== "string") {
    return false;
  }
  if (candidate.kind === "definition.lookup") {
    if (typeof candidate.payload !== "object" || candidate.payload === null) {
      return false;
    }
    const payload = candidate.payload as Record<string, unknown>;
    return (
      payload.contractVersion === DEFINITION_CONTRACT_VERSION &&
      typeof payload.requestId === "string" &&
      payload.requestId.length > 0 &&
      payload.requestId.length <= 128 &&
      typeof payload.lemma === "string" &&
      Array.isArray(payload.editions) &&
      payload.editions.length > 0 &&
      payload.editions.length <= DEFINITION_EDITIONS.length &&
      new Set(payload.editions).size === payload.editions.length &&
      payload.editions.every(
        (edition) =>
          typeof edition === "string" &&
          DEFINITION_EDITIONS.includes(
            edition as DefinitionRequest["editions"][number],
          ),
      )
    );
  }
  if (candidate.kind === "local.lookup") {
    return (
      typeof candidate.requestId === "string" &&
      "token" in value &&
      typeof value.token === "string"
    );
  }
  if (candidate.kind === "settings.update") {
    return (
      typeof candidate.requestId === "string" &&
      "settings" in value &&
      typeof value.settings === "object" &&
      value.settings !== null
    );
  }
  if (candidate.kind === "page.revoke-persistent") {
    return (
      typeof candidate.requestId === "string" &&
      "origin" in value &&
      typeof value.origin === "string"
    );
  }
  return (
    [
      "definition.cancel",
      "local.lookup",
      "local.lookup-batch",
      "local.diagnostics",
      "settings.get",
      "settings.update",
      "page.activate-temporary",
      "page.grant-persistent",
      "page.revoke-persistent",
      "page.deactivate-current",
      "diagnostics.get",
    ].includes(candidate.kind) &&
    typeof candidate.requestId === "string" &&
    (candidate.kind !== "local.lookup-batch" ||
      ("tokens" in value &&
        Array.isArray(value.tokens) &&
        value.tokens.length > 0 &&
        value.tokens.length <= 128 &&
        value.tokens.every((token) => typeof token === "string")))
  );
}
