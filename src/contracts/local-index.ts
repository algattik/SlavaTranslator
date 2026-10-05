export const LOCAL_INDEX_SCHEMA_VERSION = 1;

export interface LocalIndexMetadata {
  schemaVersion: typeof LOCAL_INDEX_SCHEMA_VERSION;
  kind: "stress" | "morphology";
  stringEncoding?: "windows-1251-with-utf-8-fallback";
  sourceRevision: string;
  sourceDigest: `sha256:${string}`;
  artifactDigest: `sha256:${string}`;
  snapshotDate: string;
  recordCount: number;
  files: Record<
    string,
    {
      bytes: number;
      digest: `sha256:${string}`;
      chunkSize: number;
      chunks: Array<`sha256:${string}`>;
    }
  >;
}

export interface StressCandidate {
  stressed: string;
  source: string;
}

export interface StressLookupResult {
  normalizedForm: string;
  candidates: StressCandidate[];
  status: "resolved" | "ambiguous" | "missing" | "conflict";
}

export interface LemmaCandidate {
  lemma: string;
  source: string;
  aspect?: VerbAspect;
  aspectCounterparts?: string[];
  grammaticalAnalyses?: GrammarTag[][];
}

export type VerbAspect = "imperfective" | "perfective" | "biaspectual";

export const GRAMMAR_TAGS = [
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "instrumental",
  "prepositional",
  "locative",
  "partitive",
  "vocative",
  "first-person",
  "second-person",
  "third-person",
  "masculine",
  "feminine",
  "neuter",
  "animate",
  "inanimate",
  "singular",
  "plural",
  "past",
  "present",
  "future",
  "indicative",
  "imperative",
  "active",
  "passive",
  "infinitive",
  "participle",
  "adverbial",
  "short-form",
  "comparative",
  "superlative",
] as const;

export type GrammarTag = (typeof GRAMMAR_TAGS)[number];

export interface MorphologyLookupResult {
  normalizedForm: string;
  candidates: LemmaCandidate[];
}
