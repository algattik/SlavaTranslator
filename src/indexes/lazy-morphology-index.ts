import {
  decodeStressPostings,
  normalizeStressForm,
  normalizeSupplementalStressForm,
} from "./stress-fsa";
import { addGrammarAnalysis } from "./morphology-index";
import type { GrammarTag, VerbAspect } from "../contracts/local-index";
import type { VerifiedAssetReader } from "./verified-asset-reader";
import { decodeIndexString } from "./windows-1251";

const DIRECTORY_RECORD_BYTES = 16;
const LEMMA_DIRECTORY_RECORD_BYTES = 8;

class LazyPostingsTable {
  private readonly directory: DataView;
  private readonly keys: Uint8Array;

  constructor(
    directory: ArrayBuffer,
    keys: ArrayBuffer,
    private readonly reader: VerifiedAssetReader,
    private readonly postingsName: string,
  ) {
    this.directory = new DataView(directory);
    this.keys = new Uint8Array(keys);
  }

  async get(key: string): Promise<number[]> {
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
        const postings = new DataView(
          await this.reader.readRange(
            this.postingsName,
            postingOffset * 4,
            postingCount * 4,
          ),
        );
        return Array.from({ length: postingCount }, (_, index) =>
          postings.getUint32(index * 4, true),
        );
      }
    }
    return [];
  }
}

export class LazyMorphologyIndex {
  private readonly stems: LazyPostingsTable;
  private readonly exceptions: LazyPostingsTable;
  private readonly aspects: LazyPostingsTable;
  private readonly grammar: LazyPostingsTable;
  private readonly stress: LazyPostingsTable;
  private readonly ambiguousStress: Set<string>;
  private readonly descriptors: DataView;
  private readonly lemmaDirectory: DataView;

  private constructor(
    private readonly reader: VerifiedAssetReader,
    input: {
      stemDirectory: ArrayBuffer;
      stemKeys: ArrayBuffer;
      exceptionDirectory: ArrayBuffer;
      exceptionKeys: ArrayBuffer;
      aspectDirectory: ArrayBuffer;
      aspectKeys: ArrayBuffer;
      grammarDirectory: ArrayBuffer;
      grammarKeys: ArrayBuffer;
      grammarAnalyses: GrammarTag[][];
      stressDirectory: ArrayBuffer;
      stressKeys: ArrayBuffer;
      stressAmbiguous: ArrayBuffer;
      descriptors: ArrayBuffer;
      paradigms: string[][];
      lemmaDirectory: ArrayBuffer;
    },
  ) {
    this.stems = new LazyPostingsTable(
      input.stemDirectory,
      input.stemKeys,
      reader,
      "stem-postings.bin",
    );
    this.exceptions = new LazyPostingsTable(
      input.exceptionDirectory,
      input.exceptionKeys,
      reader,
      "exception-postings.bin",
    );
    this.aspects = new LazyPostingsTable(
      input.aspectDirectory,
      input.aspectKeys,
      reader,
      "aspect-postings.bin",
    );
    this.grammar = new LazyPostingsTable(
      input.grammarDirectory,
      input.grammarKeys,
      reader,
      "grammar-postings.bin",
    );
    this.grammarAnalyses = input.grammarAnalyses;
    if (this.grammarAnalyses.length === 0) {
      throw new Error("Grammar analysis dictionary is empty");
    }
    this.stress = new LazyPostingsTable(
      input.stressDirectory,
      input.stressKeys,
      reader,
      "stress-postings.bin",
    );
    this.ambiguousStress = new Set(
      JSON.parse(new TextDecoder().decode(input.stressAmbiguous)) as string[],
    );
    this.descriptors = new DataView(input.descriptors);
    this.paradigms = input.paradigms;
    this.lemmaDirectory = new DataView(input.lemmaDirectory);
  }

  private readonly paradigms: string[][];
  private readonly grammarAnalyses: GrammarTag[][];

  static async create(
    reader: VerifiedAssetReader,
  ): Promise<LazyMorphologyIndex> {
    const [
      stemDirectory,
      stemKeys,
      exceptionDirectory,
      exceptionKeys,
      aspectDirectory,
      aspectKeys,
      grammarDirectory,
      grammarKeys,
      grammarAnalysesBytes,
      stressDirectory,
      stressKeys,
      stressAmbiguous,
      descriptors,
      paradigmsBytes,
      lemmaDirectory,
    ] = await Promise.all([
      reader.readAll("stem-directory.bin"),
      reader.readAll("stem-keys.bin"),
      reader.readAll("exception-directory.bin"),
      reader.readAll("exception-keys.bin"),
      reader.readAll("aspect-directory.bin"),
      reader.readAll("aspect-keys.bin"),
      reader.readAll("grammar-directory.bin"),
      reader.readAll("grammar-keys.bin"),
      reader.readAll("grammar-analyses.json"),
      reader.readAll("stress-directory.bin"),
      reader.readAll("stress-keys.bin"),
      reader.readAll("stress-ambiguous.json"),
      reader.readAll("descriptors.bin"),
      reader.readAll("paradigms.json"),
      reader.readAll("lemma-directory.bin"),
    ]);
    const paradigms = JSON.parse(
      new TextDecoder().decode(paradigmsBytes),
    ) as string[][];
    const grammarAnalyses = JSON.parse(
      new TextDecoder().decode(grammarAnalysesBytes),
    ) as GrammarTag[][];
    return new LazyMorphologyIndex(reader, {
      stemDirectory,
      stemKeys,
      exceptionDirectory,
      exceptionKeys,
      aspectDirectory,
      aspectKeys,
      grammarDirectory,
      grammarKeys,
      grammarAnalyses,
      stressDirectory,
      stressKeys,
      stressAmbiguous,
      descriptors,
      paradigms,
      lemmaDirectory,
    });
  }

  async lookup(value: string): Promise<string[]> {
    const form = normalizeStressForm(value);
    const lemmaIds = new Set(await this.exceptions.get(form));
    for (let length = 1; length <= form.length; length++) {
      const stem = form.slice(0, length);
      const ending = form.slice(length);
      for (const descriptorId of await this.stems.get(stem)) {
        const offset = descriptorId * 8;
        const paradigmId = this.descriptors.getUint32(offset, true);
        const lemmaId = this.descriptors.getUint32(offset + 4, true);
        if (this.paradigms[paradigmId]?.includes(ending) === true) {
          lemmaIds.add(lemmaId);
        }
      }
    }
    const lemmas = await Promise.all(
      [...lemmaIds].map((lemmaId) => this.getLemma(lemmaId)),
    );
    return lemmas.sort((left, right) => left.localeCompare(right, "ru"));
  }

  async lookupStress(value: string): Promise<{
    positions: number[];
    yoPositions: number[];
    ambiguous: boolean;
  }> {
    const form = normalizeSupplementalStressForm(value);
    const postings = decodeStressPostings(await this.stress.get(form));
    return {
      ...postings,
      ambiguous: this.ambiguousStress.has(form),
    };
  }

  async lookupAspect(
    lemma: string,
  ): Promise<{ aspect: VerbAspect; counterparts: string[] } | null> {
    const [aspectCode, ...counterpartIds] = await this.aspects.get(lemma);
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
      counterparts: await Promise.all(
        counterpartIds.map((lemmaId) => this.getLemma(lemmaId)),
      ),
    };
  }

  async lookupGrammar(value: string): Promise<Map<string, GrammarTag[][]>> {
    const postings = await this.grammar.get(normalizeStressForm(value));
    const relations = await Promise.all(
      postings.map(async (posting) => {
        const lemmaId = Math.floor(posting / this.grammarAnalyses.length);
        const analysisId = posting % this.grammarAnalyses.length;
        const analysis = this.grammarAnalyses[analysisId];
        if (analysis === undefined) {
          throw new Error(`Unknown grammar analysis ID ${analysisId}`);
        }
        return { lemma: await this.getLemma(lemmaId), analysis };
      }),
    );
    const result = new Map<string, GrammarTag[][]>();
    for (const { lemma, analysis } of relations) {
      const analyses = result.get(lemma) ?? [];
      addGrammarAnalysis(analyses, analysis);
      result.set(lemma, analyses);
    }
    return result;
  }

  private async getLemma(lemmaId: number): Promise<string> {
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
      new Uint8Array(await this.reader.readRange("lemmas.bin", start, length)),
      encoding,
    );
  }
}
