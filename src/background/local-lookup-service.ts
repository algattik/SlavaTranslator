import {
  type LocalIndexMetadata,
  type MorphologyLookupResult,
  type StressLookupResult,
} from "../contracts/local-index";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/messages";
import { InvalidLemmaError, normalizeLemma } from "../domain/normalize-lemma";
import { LazyMorphologyIndex } from "../indexes/lazy-morphology-index";
import {
  inherentYoStress,
  normalizeStressForm,
  normalizeStressSpelling,
  StressFsa,
} from "../indexes/stress-fsa";
import {
  loadIndexMetadata,
  VerifiedAssetReader,
} from "../indexes/verified-asset-reader";

interface LocalLookup {
  morphology: MorphologyLookupResult;
  stress: StressLookupResult;
}

function applyStress(
  value: string,
  positions: number[],
  yoPositions: number[],
): string {
  const spelling = [...value]
    .map((character, index) => {
      if (!yoPositions.includes(index)) {
        return character;
      }
      return character === "Е" ? "Ё" : character === "е" ? "ё" : character;
    })
    .join("");
  if (
    [...normalizeStressForm(spelling)].filter((character) =>
      "аеиоуыэюяё".includes(character),
    ).length <= 1
  ) {
    return spelling.normalize("NFC");
  }
  return [...spelling]
    .map((character, index) =>
      positions.includes(index) && character.toLocaleLowerCase("ru") !== "ё"
        ? `${character}\u0301`
        : character,
    )
    .join("")
    .normalize("NFC");
}

export class LocalLookupService {
  private readonly cache = new Map<string, LocalLookup>();
  private cacheHits = 0;
  private cacheMisses = 0;

  private constructor(
    private readonly morphology: LazyMorphologyIndex,
    private readonly stressFsa: StressFsa,
    private readonly stressConflicts: Set<string>,
    private readonly morphologyMetadata: LocalIndexMetadata,
    private readonly stressMetadata: LocalIndexMetadata,
  ) {}

  static async create(input: {
    morphologyBaseUrl: string;
    stressBaseUrl: string;
    fetcher?: typeof fetch;
  }): Promise<LocalLookupService> {
    const fetcher = input.fetcher ?? globalThis.fetch.bind(globalThis);
    const [morphologyMetadata, stressMetadata] = await Promise.all([
      loadIndexMetadata(input.morphologyBaseUrl, "morphology", fetcher),
      loadIndexMetadata(input.stressBaseUrl, "stress", fetcher),
    ]);
    const morphologyReader = new VerifiedAssetReader(
      input.morphologyBaseUrl,
      morphologyMetadata,
      fetcher,
    );
    const stressReader = new VerifiedAssetReader(
      input.stressBaseUrl,
      stressMetadata,
      fetcher,
    );
    const [morphology, stressBytes, conflictBytes] = await Promise.all([
      LazyMorphologyIndex.create(morphologyReader),
      stressReader.readAll("dictionary.bin"),
      stressReader.readAll("conflicts.json"),
    ]);
    return new LocalLookupService(
      morphology,
      new StressFsa(stressBytes),
      new Set(JSON.parse(new TextDecoder().decode(conflictBytes)) as string[]),
      morphologyMetadata,
      stressMetadata,
    );
  }

  async lookup(token: string): Promise<LocalLookup> {
    const validated = normalizeLemma(token);
    const normalized = normalizeStressForm(validated);
    const cacheKey = normalizeStressSpelling(validated);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.cacheHits += 1;
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }
    this.cacheMisses += 1;

    const lemmaCandidates = await this.morphology.lookup(normalized);
    const grammaticalAnalyses = await this.morphology.lookupGrammar(normalized);
    const exactAnalysisOwner = lemmaCandidates.find(
      (lemma) =>
        normalizeStressForm(lemma) === normalized &&
        (grammaticalAnalyses.get(lemma)?.length ?? 0) > 0,
    );
    const morphology: MorphologyLookupResult = {
      normalizedForm: normalized,
      candidates: await Promise.all(
        lemmaCandidates.map(async (lemma) => {
          const aspect = await this.morphology.lookupAspect(lemma);
          const analyses =
            exactAnalysisOwner === undefined || exactAnalysisOwner === lemma
              ? grammaticalAnalyses.get(lemma)
              : undefined;
          return {
            lemma,
            source: "kaikki-en-2026-09-28",
            ...(analyses === undefined
              ? {}
              : { grammaticalAnalyses: analyses }),
            ...(aspect === null
              ? {}
              : {
                  aspect: aspect.aspect,
                  aspectCounterparts: aspect.counterparts,
                }),
          };
        }),
      ),
    };

    const conflict = this.stressConflicts.has(normalized);
    const availableFsaPatterns = this.stressFsa.lookup(normalized);
    const inherentYoPositions = inherentYoStress(normalized);
    const supplemental = await this.morphology.lookupStress(normalized);
    const yoPositions = [
      ...new Set([...inherentYoPositions, ...supplemental.yoPositions]),
    ].sort((left, right) => left - right);
    const unresolvedConflict =
      conflict &&
      supplemental.positions.length === 0 &&
      supplemental.yoPositions.length === 0;
    const fsaPatterns = conflict ? [] : availableFsaPatterns;
    const fsaPositions = [...new Set(fsaPatterns.flat())]
      .filter((position) => !yoPositions.includes(position))
      .sort((left, right) => left - right);
    const combinedPositions = [
      ...new Set([...fsaPositions, ...supplemental.positions]),
    ].sort((left, right) => left - right);
    const patterns =
      unresolvedConflict ||
      (combinedPositions.length === 0 && yoPositions.length === 0)
        ? []
        : [combinedPositions];
    const evidenceSignatures = new Set(
      [
        fsaPositions,
        inherentYoPositions,
        supplemental.positions,
        supplemental.yoPositions,
      ]
        .filter((positions) => positions.length > 0)
        .map((positions) => positions.join(",")),
    );
    const source =
      (supplemental.positions.length > 0 ||
        supplemental.yoPositions.length > 0) &&
      (fsaPositions.length > 0 || inherentYoPositions.length > 0)
        ? "russian-stress-marker + kaikki-en-2026-09-28"
        : fsaPatterns.length > 0 || inherentYoPositions.length > 0
          ? "russian-stress-marker"
          : "kaikki-en-2026-09-28";
    const stress: StressLookupResult = {
      normalizedForm: normalized,
      candidates: patterns.map((positions) => ({
        stressed: applyStress(validated, positions, yoPositions),
        source,
      })),
      status: unresolvedConflict
        ? "conflict"
        : patterns.length === 0
          ? "missing"
          : fsaPatterns.length > 1 ||
              supplemental.ambiguous ||
              evidenceSignatures.size > 1
            ? "ambiguous"
            : "resolved",
    };

    const result = { morphology, stress };
    this.cache.set(cacheKey, result);
    while (this.cache.size > 512) {
      const oldest = this.cache.keys().next().value;
      if (typeof oldest !== "string") {
        break;
      }
      this.cache.delete(oldest);
    }
    return result;
  }

  get diagnostics(): {
    cacheEntries: number;
    cacheHits: number;
    cacheMisses: number;
    morphology: Pick<
      LocalIndexMetadata,
      "artifactDigest" | "snapshotDate" | "sourceRevision"
    >;
    stress: Pick<
      LocalIndexMetadata,
      "artifactDigest" | "snapshotDate" | "sourceRevision"
    >;
  } {
    return {
      cacheEntries: this.cache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      morphology: {
        artifactDigest: this.morphologyMetadata.artifactDigest,
        snapshotDate: this.morphologyMetadata.snapshotDate,
        sourceRevision: this.morphologyMetadata.sourceRevision,
      },
      stress: {
        artifactDigest: this.stressMetadata.artifactDigest,
        snapshotDate: this.stressMetadata.snapshotDate,
        sourceRevision: this.stressMetadata.sourceRevision,
      },
    };
  }
}

export async function handleLocalLookupRequest(
  request: RuntimeRequest,
  service: Promise<LocalLookupService>,
): Promise<RuntimeResponse | undefined> {
  if (
    request.kind !== "local.lookup" &&
    request.kind !== "local.lookup-batch" &&
    request.kind !== "local.diagnostics"
  ) {
    return undefined;
  }
  if (request.kind === "local.diagnostics") {
    return {
      kind: "local.diagnostics-result",
      requestId: request.requestId,
      ...(await service).diagnostics,
    };
  }
  if (request.kind === "local.lookup-batch") {
    try {
      const localService = await service;
      const results = [];
      for (const token of request.tokens) {
        results.push({ token, ...(await localService.lookup(token)) });
      }
      return {
        kind: "local.batch-result",
        requestId: request.requestId,
        results,
      };
    } catch (error) {
      if (!(error instanceof InvalidLemmaError)) {
        console.error("Local batch lookup failed", {
          requestId: request.requestId,
          error,
        });
      }
      return {
        kind: "local.failure",
        requestId: request.requestId,
        error:
          error instanceof InvalidLemmaError
            ? "invalid-token"
            : "index-unavailable",
      };
    }
  }
  try {
    const result = await (await service).lookup(request.token);
    return {
      kind: "local.result",
      requestId: request.requestId,
      ...result,
    };
  } catch (error) {
    if (error instanceof InvalidLemmaError) {
      return {
        kind: "local.failure",
        requestId: request.requestId,
        error: "invalid-token",
      };
    }
    console.error("Local index lookup failed", {
      requestId: request.requestId,
      error,
    });
    return {
      kind: "local.failure",
      requestId: request.requestId,
      error: "index-unavailable",
    };
  }
}
