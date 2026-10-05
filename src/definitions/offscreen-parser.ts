import {
  DEFINITION_RESPONSE_LIMIT_BYTES,
  isDefinitionEdition,
  type DefinitionEdition,
} from "../contracts/definition";
import type { ParseResult } from "./parser";

interface OffscreenParseRequest {
  kind: "offscreen.parse-definition";
  requestId: string;
  edition: DefinitionEdition;
  html: string;
}

interface OffscreenParseResponse {
  kind: "offscreen.parse-result";
  requestId: string;
  result: ParseResult;
}

function isParseResult(value: unknown): value is ParseResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    typeof value.kind !== "string"
  ) {
    return false;
  }
  if (value.kind === "no-russian-entry" || value.kind === "api-changed") {
    return true;
  }
  return (
    value.kind === "success" &&
    "entries" in value &&
    Array.isArray(value.entries)
  );
}

export class OffscreenDefinitionParser {
  private creatingDocument: Promise<void> | null = null;

  constructor(
    private readonly runtime: {
      getURL(path: "/offscreen.html"): string;
      sendMessage(message: OffscreenParseRequest): Promise<unknown>;
    },
    private readonly offscreen: {
      createDocument(options: {
        url: string;
        reasons: ["DOM_PARSER"];
        justification: string;
      }): Promise<void>;
      hasDocument(): Promise<boolean>;
    },
  ) {}

  async parse(
    requestId: string,
    edition: DefinitionEdition,
    html: string,
  ): Promise<ParseResult> {
    await this.ensureDocument();
    const response: unknown = await this.runtime.sendMessage({
      kind: "offscreen.parse-definition",
      requestId,
      edition,
      html,
    });
    if (
      typeof response !== "object" ||
      response === null ||
      !("kind" in response) ||
      response.kind !== "offscreen.parse-result" ||
      !("requestId" in response) ||
      response.requestId !== requestId ||
      !("result" in response) ||
      !isParseResult(response.result)
    ) {
      throw new Error("Invalid offscreen parser response");
    }
    return response.result;
  }

  private async ensureDocument(): Promise<void> {
    if (await this.offscreen.hasDocument()) {
      return;
    }
    this.creatingDocument ??= this.offscreen.createDocument({
      url: this.runtime.getURL("/offscreen.html"),
      reasons: ["DOM_PARSER"],
      justification:
        "Parse Wiktionary HTML in a detached extension document and return text only",
    });
    try {
      await this.creatingDocument;
    } finally {
      this.creatingDocument = null;
    }
  }
}

export function isOffscreenParseRequest(
  value: unknown,
): value is OffscreenParseRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "offscreen.parse-definition" &&
    "requestId" in value &&
    typeof value.requestId === "string" &&
    "edition" in value &&
    isDefinitionEdition(value.edition) &&
    "html" in value &&
    typeof value.html === "string" &&
    new TextEncoder().encode(value.html).byteLength <=
      DEFINITION_RESPONSE_LIMIT_BYTES
  );
}

export type { OffscreenParseResponse };
