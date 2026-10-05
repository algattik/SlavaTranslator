import {
  DEFINITION_CONTRACT_VERSION,
  type DefinitionFailure,
  type DefinitionRequest,
  type DefinitionResponse,
} from "../contracts/definition";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/messages";

interface DefinitionLookupClient {
  lookup(
    request: DefinitionRequest,
    signal?: AbortSignal,
  ): Promise<DefinitionResponse>;
}

function aborted(requestId: string): DefinitionFailure {
  return {
    contractVersion: DEFINITION_CONTRACT_VERSION,
    requestId,
    code: "aborted",
  };
}

function invalidResponse(requestId: string): DefinitionFailure {
  return {
    contractVersion: DEFINITION_CONTRACT_VERSION,
    requestId,
    code: "invalid-response",
  };
}

export class DefinitionService {
  private readonly activeByTab = new Map<
    number,
    Map<string, AbortController>
  >();
  private readonly usedRequestIds = new Set<string>();
  private lastError: DefinitionFailure["code"] | null = null;

  constructor(private readonly client: DefinitionLookupClient) {}

  async handle(
    request: RuntimeRequest,
    tabId: number | undefined,
  ): Promise<RuntimeResponse | undefined> {
    if (
      request.kind !== "definition.lookup" &&
      request.kind !== "definition.cancel"
    ) {
      return undefined;
    }
    if (tabId === undefined) {
      return request.kind === "definition.lookup"
        ? {
            kind: "definition.result",
            payload: aborted(request.payload.requestId),
          }
        : undefined;
    }
    if (request.kind === "definition.cancel") {
      const active = this.activeByTab.get(tabId);
      const controller = active?.get(request.requestId);
      if (controller !== undefined) {
        controller.abort();
        active?.delete(request.requestId);
        if (active?.size === 0) {
          this.activeByTab.delete(tabId);
        }
      }
      return undefined;
    }
    const requestId = request.payload.requestId;
    if (this.usedRequestIds.has(requestId)) {
      return {
        kind: "definition.result",
        payload: aborted(requestId),
      };
    }
    this.rememberRequestId(requestId);
    const active =
      this.activeByTab.get(tabId) ?? new Map<string, AbortController>();
    if (active.size >= 2) {
      return {
        kind: "definition.result",
        payload: aborted(requestId),
      };
    }
    const controller = new AbortController();
    active.set(requestId, controller);
    this.activeByTab.set(tabId, active);
    try {
      const payload = await this.client.lookup(
        request.payload,
        controller.signal,
      );
      this.lastError = "code" in payload ? payload.code : null;
      return {
        kind: "definition.result",
        payload,
      };
    } catch (error) {
      console.error("Definition lookup failed", { error, requestId, tabId });
      return {
        kind: "definition.result",
        payload: invalidResponse(requestId),
      };
    } finally {
      const current = this.activeByTab.get(tabId);
      if (current?.get(requestId) === controller) {
        current.delete(requestId);
        if (current.size === 0) {
          this.activeByTab.delete(tabId);
        }
      }
    }
  }

  get diagnostics(): { lastError: DefinitionFailure["code"] | null } {
    return { lastError: this.lastError };
  }

  private rememberRequestId(requestId: string): void {
    this.usedRequestIds.add(requestId);
    while (this.usedRequestIds.size > 2048) {
      const oldest = this.usedRequestIds.values().next().value;
      if (typeof oldest !== "string") {
        break;
      }
      this.usedRequestIds.delete(oldest);
    }
  }
}
