import { normalizeStressForm } from "./stress-fsa";
export { decodeStressPostings, YO_POSITION_FLAG } from "./stress-fsa";
import type { GrammarTag, VerbAspect } from "../contracts/local-index";
import { decodeIndexString } from "./windows-1251";

const DIRECTORY_RECORD_BYTES = 16;
const LEMMA_DIRECTORY_RECORD_BYTES = 8;

export function addGrammarAnalysis(
  analyses: GrammarTag[][],
  analysis: GrammarTag[],
): void {
  const analysisTags = new Set(analysis);
  if (
    analyses.some((candidate) =>
      analysis.every((tag) => candidate.includes(tag)),
    )
  ) {
    return;
  }
  for (let index = analyses.length - 1; index >= 0; index -= 1) {
    const candidate = analyses[index];
    if (
      candidate !== undefined &&
      candidate.every((tag) => analysisTags.has(tag))
    ) {
      analyses.splice(index, 1);
    }
  }
  analyses.push(analysis);
}

export class StringPostingsTable {
  private readonly directory: DataView;
  private readonly keys: Uint8Array;
  private readonly postings: DataView;

  constructor(
    directory: ArrayBuffer,
    keys: ArrayBuffer,
    postings: ArrayBuffer,
  ) {
    if (directory.byteLength % DIRECTORY_RECORD_BYTES !== 0) {
      throw new Error("Invalid morphology table directory");
    }
    if (postings.byteLength % 4 !== 0) {
      throw new Error("Invalid morphology postings");
    }
    this.directory = new DataView(directory);
    this.keys = new Uint8Array(keys);
    this.postings = new DataView(postings);
  }

  get(key: string): number[] {
    let low = 0;
    let high = this.directory.byteLength / DIRECTORY_RECORD_BYTES - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const offset = middle * DIRECTORY_RECORD_BYTES;
      const keyOffset = this.directory.getUint32(offset, true);
      const keyLength = this.directory.getUint16(offset + 4, true);
      const candidate = decodeIndexString(
        this.keys.subarray(keyOffset, keyOffset + keyLength),
        this.directory.getUint16(offset + 6, true),
      );
      const comparison = candidate.localeCompare(key, "ru");
      if (comparison < 0) {
        low = middle + 1;
      } else if (comparison > 0) {
        high = middle - 1;
      } else {
        const postingOffset = this.directory.getUint32(offset + 8, true);
        const postingCount = this.directory.getUint32(offset + 12, true);
        return Array.from({ length: postingCount }, (_, index) =>
          this.postings.getUint32((postingOffset + index) * 4, true),
        );
      }
    }
    return [];
  }
}

export class MorphologyIndex {
  private readonly stemIndex: StringPostingsTable;
  private readonly exceptions: StringPostingsTable;
  private readonly aspects: StringPostingsTable;
  private readonly grammar: StringPostingsTable;
  private readonly grammarAnalyses: GrammarTag[][];
  private readonly descriptors: DataView;
  private readonly paradigms: string[][];
  private readonly lemmaDirectory: DataView;
  private readonly lemmas: Uint8Array;

  constructor(input: {
    stemDirectory: ArrayBuffer;
    stemKeys: ArrayBuffer;
    stemPostings: ArrayBuffer;
    exceptionDirectory: ArrayBuffer;
    exceptionKeys: ArrayBuffer;
    exceptionPostings: ArrayBuffer;
    aspectDirectory: ArrayBuffer;
    aspectKeys: ArrayBuffer;
    aspectPostings: ArrayBuffer;
    grammarDirectory: ArrayBuffer;
    grammarKeys: ArrayBuffer;
    grammarPostings: ArrayBuffer;
    grammarAnalyses: GrammarTag[][];
    descriptors: ArrayBuffer;
    paradigms: string[][];
    lemmaDirectory: ArrayBuffer;
    lemmas: ArrayBuffer;
  }) {
    this.stemIndex = new StringPostingsTable(
      input.stemDirectory,
      input.stemKeys,
      input.stemPostings,
    );
    this.exceptions = new StringPostingsTable(
      input.exceptionDirectory,
      input.exceptionKeys,
      input.exceptionPostings,
    );
    this.aspects = new StringPostingsTable(
      input.aspectDirectory,
      input.aspectKeys,
      input.aspectPostings,
    );
    this.grammar = new StringPostingsTable(
      input.grammarDirectory,
      input.grammarKeys,
      input.grammarPostings,
    );
    this.grammarAnalyses = input.grammarAnalyses;
    if (this.grammarAnalyses.length === 0) {
      throw new Error("Grammar analysis dictionary is empty");
    }
    if (input.descriptors.byteLength % 8 !== 0) {
      throw new Error("Invalid morphology descriptors");
    }
    if (input.lemmaDirectory.byteLength % LEMMA_DIRECTORY_RECORD_BYTES !== 0) {
      throw new Error("Invalid morphology lemma directory");
    }
    this.descriptors = new DataView(input.descriptors);
    this.paradigms = input.paradigms;
    this.lemmaDirectory = new DataView(input.lemmaDirectory);
    this.lemmas = new Uint8Array(input.lemmas);
  }

  lookup(value: string): string[] {
    const form = normalizeStressForm(value);
    const lemmaIds = new Set(this.exceptions.get(form));
    for (let length = 1; length <= form.length; length++) {
      const stem = form.slice(0, length);
      const ending = form.slice(length);
      for (const descriptorId of this.stemIndex.get(stem)) {
        const offset = descriptorId * 8;
        const paradigmId = this.descriptors.getUint32(offset, true);
        const lemmaId = this.descriptors.getUint32(offset + 4, true);
        if (this.paradigms[paradigmId]?.includes(ending) === true) {
          lemmaIds.add(lemmaId);
        }
      }
    }
    return [...lemmaIds]
      .map((lemmaId) => this.getLemma(lemmaId))
      .sort((left, right) => left.localeCompare(right, "ru"));
  }

  lookupAspect(
    lemma: string,
  ): { aspect: VerbAspect; counterparts: string[] } | null {
    const [aspectCode, ...counterpartIds] = this.aspects.get(lemma);
    const aspect =
      aspectCode === 1
        ? "imperfective"
        : aspectCode === 2
          ? "perfective"
          : aspectCode === 3
            ? "biaspectual"
            : null;
    if (aspect === null) {
      return null;
    }
    return {
      aspect,
      counterparts: counterpartIds.map((lemmaId) => this.getLemma(lemmaId)),
    };
  }

  lookupGrammar(value: string): Map<string, GrammarTag[][]> {
    const postings = this.grammar.get(normalizeStressForm(value));
    const result = new Map<string, GrammarTag[][]>();
    for (const posting of postings) {
      const lemmaId = Math.floor(posting / this.grammarAnalyses.length);
      const analysisId = posting % this.grammarAnalyses.length;
      const analysis = this.grammarAnalyses[analysisId];
      if (analysis === undefined) {
        throw new Error(`Unknown grammar analysis ID ${analysisId}`);
      }
      const lemma = this.getLemma(lemmaId);
      const analyses = result.get(lemma) ?? [];
      addGrammarAnalysis(analyses, analysis);
      result.set(lemma, analyses);
    }
    return result;
  }

  private getLemma(lemmaId: number): string {
    const offset = lemmaId * LEMMA_DIRECTORY_RECORD_BYTES;
    if (
      offset + LEMMA_DIRECTORY_RECORD_BYTES >
      this.lemmaDirectory.byteLength
    ) {
      throw new Error(`Unknown lemma ID ${lemmaId}`);
    }
    const start = this.lemmaDirectory.getUint32(offset, true);
    const encodedLength = this.lemmaDirectory.getUint32(offset + 4, true);
    const encoding = encodedLength >>> 31;
    const length = encodedLength & 0x7fffffff;
    return decodeIndexString(
      this.lemmas.subarray(start, start + length),
      encoding,
    );
  }
}
