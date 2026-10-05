import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  DEFINITION_CONTRACT_VERSION,
  DEFINITION_RESPONSE_LIMIT_BYTES,
  MAX_DEFINITION_ENTRIES,
  MAX_SENSE_CODE_POINTS,
  MAX_SENSES_PER_ENTRY,
  type DefinitionEdition,
} from "../../src/contracts/definition";
import {
  type DefinitionHtmlParser,
  MediaWikiClient,
} from "../../src/definitions/mediawiki-client";

const fixtures = path.resolve("tests/fixtures/mediawiki");

function jsonResponse(
  payload: unknown,
  options: {
    origin?: string;
    contentType?: string;
    status?: number;
    headers?: Record<string, string>;
  } = {},
): Response {
  const response = new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers: {
      "content-type": options.contentType ?? "application/json; charset=utf-8",
      ...options.headers,
    },
  });
  Object.defineProperty(response, "url", {
    value: `${options.origin ?? "https://en.wiktionary.org"}/w/api.php`,
  });
  return response;
}

function request(editions: DefinitionEdition[] = ["en"]) {
  return {
    contractVersion: DEFINITION_CONTRACT_VERSION,
    requestId: `request-${editions.join("-")}`,
    lemma: "говорить",
    editions,
  } as const;
}

describe("MediaWikiClient", () => {
  it("uses the bounded credential-free Action API contract", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          parse: { title: "говорить", revid: 42, text: "<p>html</p>" },
        }),
      ),
    );
    const parse = vi.fn<DefinitionHtmlParser["parse"]>(() =>
      Promise.resolve({
        kind: "success",
        entries: [{ partOfSpeech: "Verb", senses: ["to speak"] }],
      }),
    );
    const parser: DefinitionHtmlParser = {
      parse,
    };
    const result = await new MediaWikiClient(parser, fetcher).lookup(request());

    expect(result).toMatchObject({
      requestId: "request-en",
      resolvedEdition: "en",
      fallbackUsed: false,
      entries: [{ partOfSpeech: "Verb", senses: ["to speak"] }],
      attribution:
        "Wiktionary contributors; text is available under CC BY-SA and may also be available under GFDL",
      sourceUrl:
        "https://en.wiktionary.org/wiki/%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%D0%B8%D1%82%D1%8C",
    });
    const call = fetcher.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected a fetch call");
    }
    const [url, init] = call;
    if (!(url instanceof URL) || init === undefined) {
      throw new Error("Expected a URL and request options");
    }
    expect(url.origin).toBe("https://en.wiktionary.org");
    expect(url.searchParams.get("action")).toBe("parse");
    expect(url.searchParams.get("page")).toBe("говорить");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "follow",
    });
    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("api-user-agent")).toContain("SlavaRussianDictionary");
  });

  it("uses the next configured edition for a missing entry", async () => {
    const missingFixture = JSON.parse(
      await readFile(path.join(fixtures, "de/missing.json"), "utf8"),
    ) as { response: unknown };
    const fetcher = vi
      .fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        jsonResponse(missingFixture.response, {
          origin: "https://de.wiktionary.org",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          parse: { title: "говорить", revid: 43, text: "<p>html</p>" },
        }),
      );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({
          kind: "success",
          entries: [{ partOfSpeech: "Verb", senses: ["to speak"] }],
        }),
      ),
    };

    const result = await new MediaWikiClient(parser, fetcher).lookup(
      request(["de", "en"]),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      requestedEdition: "de",
      resolvedEdition: "en",
      fallbackUsed: true,
    });
  });

  it("does not request English unless it is configured", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          { error: { code: "missingtitle", info: "Missing" } },
          { origin: "https://de.wiktionary.org" },
        ),
      ),
    );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(),
    };

    await expect(
      new MediaWikiClient(parser, fetcher).lookup(request(["de"])),
    ).resolves.toMatchObject({ code: "missing" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps plural MediaWiki missing-title errors to a configured fallback", async () => {
    const fetcher = vi
      .fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        jsonResponse(
          { errors: [{ code: "missingtitle", text: "Missing" }] },
          { origin: "https://fr.wiktionary.org" },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          parse: { title: "говорить", revid: 43, text: "<p>html</p>" },
        }),
      );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({
          kind: "success",
          entries: [{ partOfSpeech: "Verb", senses: ["to speak"] }],
        }),
      ),
    };

    await expect(
      new MediaWikiClient(parser, fetcher).lookup(request(["fr", "en"])),
    ).resolves.toMatchObject({
      requestedEdition: "fr",
      resolvedEdition: "en",
      fallbackUsed: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds parser output by entry, sense, and code-point counts", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          parse: { title: "говорить", revid: 42, text: "<p>html</p>" },
        }),
      ),
    );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({
          kind: "success",
          entries: Array.from(
            { length: MAX_DEFINITION_ENTRIES + 5 },
            (_, entryIndex) => ({
              partOfSpeech: `Part ${entryIndex} ${"я".repeat(160)}`,
              senses: Array.from({ length: MAX_SENSES_PER_ENTRY + 5 }, () =>
                "я".repeat(MAX_SENSE_CODE_POINTS + 20),
              ),
            }),
          ),
        }),
      ),
    };

    const result = await new MediaWikiClient(parser, fetcher).lookup(request());
    expect(result).toHaveProperty("entries");
    if (!("entries" in result)) {
      throw new Error("Expected bounded definition entries");
    }
    expect(result.entries).toHaveLength(MAX_DEFINITION_ENTRIES);
    for (const entry of result.entries) {
      expect([...(entry.partOfSpeech ?? "")]).toHaveLength(128);
      expect(entry.senses).toHaveLength(MAX_SENSES_PER_ENTRY);
      expect([...entry.senses[0]!]).toHaveLength(MAX_SENSE_CODE_POINTS);
    }
  });

  it.each([
    ["unexpected-origin", "https://example.invalid", "application/json"],
    ["invalid-content-type", "https://en.wiktionary.org", "text/html"],
  ] as const)(
    "rejects %s without fallback",
    async (code, origin, contentType) => {
      const fetcher = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse(
            { parse: { title: "говорить", revid: 1, text: "<p>x</p>" } },
            { origin, contentType },
          ),
        ),
      );
      const parse = vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({
          kind: "success",
          entries: [{ partOfSpeech: null, senses: ["x"] }],
        }),
      );
      const parser: DefinitionHtmlParser = {
        parse,
      };
      const result = await new MediaWikiClient(parser, fetcher).lookup(
        request(),
      );
      expect(result).toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(parse).not.toHaveBeenCalled();
    },
  );

  it("does not fall back on an edition parser contract change", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          { parse: { title: "говорить", revid: 1, text: "<p>x</p>" } },
          { origin: "https://fr.wiktionary.org" },
        ),
      ),
    );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({
          kind: "api-changed",
        }),
      ),
    };
    const result = await new MediaWikiClient(parser, fetcher).lookup(
      request(["fr", "en"]),
    );
    expect(result).toMatchObject({ code: "api-changed" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps an offscreen parser failure to api-changed", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          parse: { title: "говорить", revid: 1, text: "<p>x</p>" },
        }),
      ),
    );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.reject(new Error("offscreen unavailable")),
      ),
    };
    await expect(
      new MediaWikiClient(parser, fetcher).lookup(request()),
    ).resolves.toMatchObject({ code: "api-changed" });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("enforces the decoded response ceiling before parsing", async () => {
    const response = new Response(
      "x".repeat(DEFINITION_RESPONSE_LIMIT_BYTES + 1),
      { headers: { "content-type": "application/json" } },
    );
    Object.defineProperty(response, "url", {
      value: "https://en.wiktionary.org/w/api.php",
    });
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(response));
    const parse = vi.fn<DefinitionHtmlParser["parse"]>(() =>
      Promise.resolve({ kind: "api-changed" }),
    );

    const result = await new MediaWikiClient({ parse }, fetcher).lookup(
      request(),
    );
    expect(result).toMatchObject({ code: "response-too-large" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("distinguishes caller abort from timeout", async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({ kind: "api-changed" }),
      ),
    };
    const caller = new AbortController();
    const callerLookup = new MediaWikiClient(parser, fetcher, 1_000).lookup(
      request(),
      caller.signal,
    );
    caller.abort();
    await expect(callerLookup).resolves.toMatchObject({ code: "aborted" });

    const timeout = new AbortController();
    const timeoutLookup = new MediaWikiClient(
      parser,
      fetcher,
      1_000,
      () => timeout.signal,
    ).lookup({
      ...request(),
      requestId: "timeout",
    });
    timeout.abort();
    await expect(timeoutLookup).resolves.toMatchObject({ code: "timeout" });
  });

  it("reports throttling and preserves Retry-After", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          {},
          {
            status: 429,
            headers: { "retry-after": "17" },
          },
        ),
      ),
    );
    const parser: DefinitionHtmlParser = {
      parse: vi.fn<DefinitionHtmlParser["parse"]>(() =>
        Promise.resolve({ kind: "api-changed" }),
      ),
    };
    await expect(
      new MediaWikiClient(parser, fetcher).lookup(request()),
    ).resolves.toMatchObject({
      code: "throttled",
      retryAfterSeconds: 17,
    });
  });
});
