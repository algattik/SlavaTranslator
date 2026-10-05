import {
  DEFINITION_CONTRACT_VERSION,
  DEFINITION_EDITIONS,
  DEFINITION_REQUEST_TIMEOUT_MS,
  DEFINITION_RESPONSE_LIMIT_BYTES,
  getWiktionaryOrigin,
  MAX_DEFINITION_ENTRIES,
  MAX_SENSE_CODE_POINTS,
  MAX_SENSES_PER_ENTRY,
  type DefinitionEdition,
  type DefinitionFailure,
  type DefinitionRequest,
  type DefinitionResponse,
  type DefinitionResult,
} from "../contracts/definition";
import { normalizeLemma } from "../domain/normalize-lemma";
import type { ParseResult } from "./parser";

interface MediaWikiPayload {
  error?: { code?: string; info?: string };
  errors?: Array<{ code?: string; text?: string }>;
  parse?: {
    title?: string;
    revid?: number;
    text?: string;
  };
}

type AttemptResult =
  | {
      kind: "success";
      edition: DefinitionEdition;
      title: string;
      revisionId: number;
      entries: DefinitionResult["entries"];
    }
  | {
      kind: "failure";
      failure: DefinitionFailure;
    };

export interface DefinitionHtmlParser {
  parse(
    requestId: string,
    edition: DefinitionEdition,
    html: string,
  ): Promise<ParseResult>;
}

export type TimeoutSignalFactory = (milliseconds: number) => AbortSignal;

function failure(
  requestId: string,
  code: DefinitionFailure["code"],
  retryAfterSeconds?: number,
): DefinitionFailure {
  return retryAfterSeconds === undefined
    ? { contractVersion: DEFINITION_CONTRACT_VERSION, requestId, code }
    : {
        contractVersion: DEFINITION_CONTRACT_VERSION,
        requestId,
        code,
        retryAfterSeconds,
      };
}

function boundedEntries(
  entries: DefinitionResult["entries"],
): DefinitionResult["entries"] {
  return entries.slice(0, MAX_DEFINITION_ENTRIES).map((entry) => ({
    partOfSpeech:
      entry.partOfSpeech === null
        ? null
        : [...entry.partOfSpeech].slice(0, 128).join(""),
    senses: entry.senses
      .slice(0, MAX_SENSES_PER_ENTRY)
      .map((sense) => [...sense].slice(0, MAX_SENSE_CODE_POINTS).join("")),
  }));
}

export class MediaWikiClient {
  constructor(
    private readonly parser: DefinitionHtmlParser,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMilliseconds = DEFINITION_REQUEST_TIMEOUT_MS,
    private readonly createTimeoutSignal: TimeoutSignalFactory = (
      milliseconds,
    ) => AbortSignal.timeout(milliseconds),
  ) {}

  async lookup(
    request: DefinitionRequest,
    signal?: AbortSignal,
  ): Promise<DefinitionResponse> {
    if (
      request.contractVersion !== DEFINITION_CONTRACT_VERSION ||
      request.requestId.length === 0 ||
      request.editions.length === 0 ||
      request.editions.some((edition) => !DEFINITION_EDITIONS.includes(edition))
    ) {
      return failure(request.requestId, "invalid-response");
    }
    let lemma: string;
    try {
      lemma = normalizeLemma(request.lemma);
    } catch {
      return failure(request.requestId, "invalid-response");
    }

    let lastFailure = failure(request.requestId, "missing");
    for (const [index, edition] of request.editions.entries()) {
      const selected = await this.attempt(
        request.requestId,
        edition,
        lemma,
        signal,
      );
      if (selected.kind === "success") {
        return this.toResult(request, lemma, selected, index > 0);
      }
      lastFailure = selected.failure;
      if (
        selected.failure.code !== "missing" &&
        selected.failure.code !== "no-russian-entry"
      ) {
        return selected.failure;
      }
    }
    return lastFailure;
  }

  private async attempt(
    requestId: string,
    edition: DefinitionEdition,
    lemma: string,
    externalSignal?: AbortSignal,
  ): Promise<AttemptResult> {
    const origin = getWiktionaryOrigin(edition);
    const url = new URL("/w/api.php", origin);
    url.search = new URLSearchParams({
      action: "parse",
      page: lemma,
      prop: "text|tocdata|revid|displaytitle",
      format: "json",
      formatversion: "2",
      redirects: "1",
      origin: "*",
      disableeditsection: "1",
      disablelimitreport: "1",
    }).toString();
    const timeout = this.createTimeoutSignal(this.timeoutMilliseconds);
    const signal =
      externalSignal === undefined
        ? timeout
        : AbortSignal.any([externalSignal, timeout]);

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        credentials: "omit",
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "Api-User-Agent":
            "SlavaRussianDictionary/0.1 (https://github.com/algattik/SlavaTranslator)",
        },
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        return {
          kind: "failure",
          failure: failure(
            requestId,
            externalSignal?.aborted === true ? "aborted" : "timeout",
          ),
        };
      }
      console.error("Wiktionary request failed", { edition, requestId, error });
      return { kind: "failure", failure: failure(requestId, "offline") };
    }

    let finalOrigin: string;
    try {
      finalOrigin = new URL(response.url).origin;
    } catch {
      finalOrigin = "";
    }
    if (finalOrigin !== origin) {
      return {
        kind: "failure",
        failure: failure(requestId, "unexpected-origin"),
      };
    }
    if (response.status === 429) {
      const retryAfter = Number.parseInt(
        response.headers.get("retry-after") ?? "",
        10,
      );
      return {
        kind: "failure",
        failure: failure(
          requestId,
          "throttled",
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        ),
      };
    }
    if (!response.ok) {
      return {
        kind: "failure",
        failure: failure(requestId, "invalid-response"),
      };
    }
    if (
      !response.headers
        .get("content-type")
        ?.toLocaleLowerCase()
        .includes("application/json")
    ) {
      return {
        kind: "failure",
        failure: failure(requestId, "invalid-content-type"),
      };
    }

    let payload: MediaWikiPayload;
    try {
      const parsed: unknown = JSON.parse(await this.readBoundedBody(response));
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("invalid-json-root");
      }
      payload = parsed;
    } catch (error) {
      if (signal.aborted) {
        return {
          kind: "failure",
          failure: failure(
            requestId,
            externalSignal?.aborted === true ? "aborted" : "timeout",
          ),
        };
      }
      if (error instanceof Error && error.message === "response-too-large") {
        return {
          kind: "failure",
          failure: failure(requestId, "response-too-large"),
        };
      }
      console.error("Wiktionary JSON parsing failed", {
        edition,
        requestId,
        error,
      });
      return {
        kind: "failure",
        failure: failure(requestId, "invalid-response"),
      };
    }

    const apiErrors = [
      ...(payload.errors ?? []),
      ...(payload.error === undefined ? [] : [payload.error]),
    ];
    if (apiErrors.length > 0) {
      const code = apiErrors[0]?.code ?? "";
      return {
        kind: "failure",
        failure: failure(
          requestId,
          code === "missingtitle"
            ? "missing"
            : code === "ratelimited"
              ? "throttled"
              : "invalid-response",
        ),
      };
    }
    const parsed = payload.parse;
    if (
      parsed === undefined ||
      typeof parsed.title !== "string" ||
      typeof parsed.revid !== "number" ||
      typeof parsed.text !== "string"
    ) {
      return {
        kind: "failure",
        failure: failure(requestId, "invalid-response"),
      };
    }

    let parsedHtml: ParseResult;
    try {
      parsedHtml = await this.parser.parse(requestId, edition, parsed.text);
    } catch (error) {
      console.error("Wiktionary HTML parsing failed", {
        edition,
        requestId,
        error,
      });
      return {
        kind: "failure",
        failure: failure(requestId, "api-changed"),
      };
    }
    if (parsedHtml.kind !== "success") {
      return {
        kind: "failure",
        failure: failure(requestId, parsedHtml.kind),
      };
    }
    return {
      kind: "success",
      edition,
      title: parsed.title,
      revisionId: parsed.revid,
      entries: boundedEntries(parsedHtml.entries),
    };
  }

  private async readBoundedBody(response: Response): Promise<string> {
    if (response.body === null) {
      throw new Error("missing-body");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      bytes += result.value.byteLength;
      if (bytes > DEFINITION_RESPONSE_LIMIT_BYTES) {
        await reader.cancel();
        throw new Error("response-too-large");
      }
      chunks.push(result.value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(combined);
  }

  private toResult(
    request: DefinitionRequest,
    lemma: string,
    attempt: Extract<AttemptResult, { kind: "success" }>,
    fallbackUsed: boolean,
  ): DefinitionResult {
    const origin = getWiktionaryOrigin(attempt.edition);
    return {
      contractVersion: DEFINITION_CONTRACT_VERSION,
      requestId: request.requestId,
      requestedEdition: request.editions[0] ?? "en",
      resolvedEdition: attempt.edition,
      requestedLemma: lemma,
      resolvedTitle: attempt.title,
      revisionId: attempt.revisionId,
      sourceUrl: `${origin}/wiki/${encodeURIComponent(
        attempt.title.replaceAll(" ", "_"),
      )}`,
      entries: attempt.entries,
      fallbackUsed,
      attribution:
        "Wiktionary contributors; text is available under CC BY-SA and may also be available under GFDL",
    };
  }
}
