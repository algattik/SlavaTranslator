import { describe, expect, it, vi } from "vitest";

import { DefinitionService } from "../../src/background/definition-service";
import {
  DEFINITION_CONTRACT_VERSION,
  type DefinitionRequest,
  type DefinitionResponse,
} from "../../src/contracts/definition";

function request(requestId: string): DefinitionRequest {
  return {
    contractVersion: DEFINITION_CONTRACT_VERSION,
    requestId,
    lemma: "говорить",
    editions: ["en"],
  };
}

function success(value: DefinitionRequest): DefinitionResponse {
  return {
    contractVersion: value.contractVersion,
    requestId: value.requestId,
    requestedEdition: value.editions[0] ?? "en",
    resolvedEdition: value.editions[0] ?? "en",
    requestedLemma: value.lemma,
    resolvedTitle: value.lemma,
    revisionId: 1,
    sourceUrl: "https://en.wiktionary.org/wiki/example",
    entries: [{ partOfSpeech: "Verb", senses: ["to speak"] }],
    fallbackUsed: false,
    attribution: "Wiktionary contributors",
  };
}

describe("DefinitionService", () => {
  it("requires a tab sender and rejects replayed request IDs", async () => {
    const lookup = vi.fn(
      (value: DefinitionRequest): Promise<DefinitionResponse> =>
        Promise.resolve(success(value)),
    );
    const service = new DefinitionService({ lookup });
    const message = {
      kind: "definition.lookup",
      payload: request("one"),
    } as const;

    await expect(service.handle(message, undefined)).resolves.toMatchObject({
      payload: { code: "aborted" },
    });
    await expect(service.handle(message, 1)).resolves.toMatchObject({
      payload: { requestId: "one", resolvedEdition: "en" },
    });
    await expect(service.handle(message, 1)).resolves.toMatchObject({
      payload: { code: "aborted" },
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("allows two concurrent requests, rejects a third, and cancels by ID", async () => {
    const signals = new Map<string, AbortSignal>();
    const resolvers = new Map<string, (value: DefinitionResponse) => void>();
    const lookup = vi.fn(
      (
        value: DefinitionRequest,
        signal?: AbortSignal,
      ): Promise<DefinitionResponse> => {
        if (signal !== undefined) {
          signals.set(value.requestId, signal);
        }
        return new Promise((resolve) => {
          resolvers.set(value.requestId, resolve);
        });
      },
    );
    const service = new DefinitionService({ lookup });
    const firstRequest = request("first");
    const first = service.handle(
      { kind: "definition.lookup", payload: firstRequest },
      7,
    );
    const second = service.handle(
      { kind: "definition.lookup", payload: request("second") },
      7,
    );

    await expect(
      service.handle(
        { kind: "definition.lookup", payload: request("third") },
        7,
      ),
    ).resolves.toMatchObject({ payload: { code: "aborted" } });
    await service.handle({ kind: "definition.cancel", requestId: "first" }, 7);
    expect(signals.get("first")?.aborted).toBe(true);
    expect(signals.get("second")?.aborted).toBe(false);
    resolvers.get("first")?.({
      contractVersion: DEFINITION_CONTRACT_VERSION,
      requestId: "first",
      code: "aborted",
    });
    await expect(first).resolves.toMatchObject({
      payload: { code: "aborted" },
    });
    resolvers.get("second")?.(success(request("second")));
    await expect(second).resolves.toMatchObject({
      payload: { requestId: "second", resolvedEdition: "en" },
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("returns a typed failure and releases tab state when the client throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const lookup = vi
      .fn<
        (
          value: DefinitionRequest,
          signal?: AbortSignal,
        ) => Promise<DefinitionResponse>
      >()
      .mockRejectedValueOnce(new Error("unexpected"))
      .mockImplementationOnce((value) => Promise.resolve(success(value)));
    const service = new DefinitionService({ lookup });

    await expect(
      service.handle(
        { kind: "definition.lookup", payload: request("failure") },
        9,
      ),
    ).resolves.toMatchObject({
      payload: { requestId: "failure", code: "invalid-response" },
    });
    await expect(
      service.handle(
        { kind: "definition.lookup", payload: request("recovery") },
        9,
      ),
    ).resolves.toMatchObject({
      payload: { requestId: "recovery", resolvedEdition: "en" },
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
