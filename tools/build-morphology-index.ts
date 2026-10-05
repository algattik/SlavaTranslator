import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { deflateRawSync } from "node:zlib";

import {
  normalizeStressForm,
  normalizeStressSpelling,
  normalizeSupplementalStressForm,
  StressFsa,
  YO_POSITION_FLAG,
} from "../src/indexes/stress-fsa.ts";
import { GRAMMAR_TAGS, type GrammarTag } from "../src/contracts/local-index.ts";
import {
  encodeIndexString,
  INDEX_STRING_ENCODING_UTF8,
} from "../src/indexes/windows-1251.ts";

const cacheDirectory = path.resolve(
  process.env.SLAVA_SOURCE_CACHE ?? ".cache/slava-sources",
);
const sourcePath = path.join(cacheDirectory, "kaikki-en.jsonl");
const outputDirectory = path.resolve("public/indexes/morphology");
const generatedDirectory = path.resolve("data/generated");
const compressedBudget = 15 * 1024 * 1024;

function isRussianSurface(value: string): boolean {
  if (value.length === 0 || /\s/u.test(value)) {
    return false;
  }

  let hasCyrillic = false;
  for (const character of value) {
    if (["-", "‑", "'", "’"].includes(character)) {
      continue;
    }
    if (!/\p{Script=Cyrillic}/u.test(character)) {
      return false;
    }
    hasCyrillic = true;
  }
  return hasCyrillic;
}

const grammarTagOrder = new Map(GRAMMAR_TAGS.map((tag, index) => [tag, index]));
const inflectionTags = new Set<string>(GRAMMAR_TAGS);
const caseTags = new Set<GrammarTag>([
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "instrumental",
  "prepositional",
  "locative",
  "partitive",
  "vocative",
]);

interface InflectionRelation {
  target: string;
  tags: GrammarTag[];
}

function normalizeGrammarTags(tags: unknown[]): GrammarTag[] {
  return [
    ...new Set(
      tags.filter((tag): tag is GrammarTag => inflectionTags.has(String(tag))),
    ),
  ].sort(
    (left, right) =>
      (grammarTagOrder.get(left) ?? 0) - (grammarTagOrder.get(right) ?? 0),
  );
}

function expandGrammarTags(tags: unknown[]): GrammarTag[][] {
  const normalized = normalizeGrammarTags(tags);
  const cases = normalized.filter((tag) => caseTags.has(tag));
  if (cases.length <= 1) {
    return normalized.length === 0 ? [] : [normalized];
  }
  const shared = normalized.filter((tag) => !caseTags.has(tag));
  return cases.map((caseTag) => normalizeGrammarTags([caseTag, ...shared]));
}

function readInflectionRelations(senses: unknown): InflectionRelation[] {
  if (!Array.isArray(senses)) {
    return [];
  }
  const relations = new Map<string, InflectionRelation>();
  for (const rawSense of senses) {
    if (typeof rawSense !== "object" || rawSense === null) {
      continue;
    }
    const sense = rawSense as { tags?: unknown; form_of?: unknown };
    const tags = Array.isArray(sense.tags) ? sense.tags : [];
    const grammarAnalyses = expandGrammarTags(tags);
    if (grammarAnalyses.length === 0 || !Array.isArray(sense.form_of)) {
      continue;
    }
    for (const rawRelation of sense.form_of) {
      if (typeof rawRelation !== "object" || rawRelation === null) {
        continue;
      }
      const word = (rawRelation as { word?: unknown }).word;
      if (
        typeof word === "string" &&
        isRussianSurface(normalizeStressForm(word))
      ) {
        const target = normalizeStressSpelling(word);
        for (const grammarTags of grammarAnalyses) {
          relations.set(`${target}\0${grammarTags.join("\0")}`, {
            target,
            tags: grammarTags,
          });
        }
      }
    }
  }
  return [...relations.values()];
}

const lexicalRelativeTags = new Set([
  "abstract-noun",
  "adjective",
  "adverb",
  "augmentative",
  "clipping",
  "collective",
  "demonym",
  "diminutive",
  "emphatic",
  "endearing",
  "noun-from-verb",
  "pejorative",
  "possessive",
  "relational",
  "singulative",
]);

function isLexicalRelativeForm(
  partOfSpeech: unknown,
  source: unknown,
  tags: unknown[],
): boolean {
  if (typeof source === "string" || tags.includes("alternative")) {
    return false;
  }
  if (tags.some((tag) => lexicalRelativeTags.has(String(tag)))) {
    return true;
  }
  return (
    ["noun", "name"].includes(String(partOfSpeech)) &&
    tags.some((tag) =>
      ["feminine", "masculine", "neuter"].includes(String(tag)),
    )
  );
}

function readRelationTargets(senses: unknown, field: "alt_of"): string[] {
  if (!Array.isArray(senses)) {
    return [];
  }
  const targets = new Set<string>();
  for (const rawSense of senses) {
    if (typeof rawSense !== "object" || rawSense === null) {
      continue;
    }
    const sense = rawSense as Record<string, unknown>;
    const tags = Array.isArray(sense.tags) ? sense.tags : [];
    if (
      tags.some((tag) =>
        [
          "abbreviation",
          "acronym",
          "clipping",
          "ellipsis",
          "initialism",
          "letter",
          "morpheme",
        ].includes(String(tag)),
      )
    ) {
      continue;
    }
    const relations = sense[field];
    if (!Array.isArray(relations)) {
      continue;
    }
    for (const rawRelation of relations) {
      if (typeof rawRelation !== "object" || rawRelation === null) {
        continue;
      }
      const word = (rawRelation as { word?: unknown }).word;
      if (
        typeof word === "string" &&
        isRussianSurface(normalizeStressForm(word))
      ) {
        targets.add(normalizeStressSpelling(word));
      }
    }
  }
  return [...targets];
}

function commonPrefix(values: string[]): string {
  let prefix = values[0] ?? "";
  for (const value of values.slice(1)) {
    let position = 0;
    const limit = Math.min(prefix.length, value.length);
    while (position < limit && prefix[position] === value[position]) {
      position += 1;
    }
    prefix = prefix.slice(0, position);
    if (prefix.length === 0) {
      break;
    }
  }
  return prefix;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stressPostings(value: string): number[] {
  const postings = new Set<number>();
  let position = -1;
  for (const character of value.normalize("NFD")) {
    if (character === "\u0301") {
      if (position >= 0) {
        postings.add(position);
      }
    } else if (character === "\u0308") {
      if (position >= 0) {
        postings.add(YO_POSITION_FLAG + position);
      }
    } else if (!/\p{Mark}/u.test(character)) {
      position += 1;
    }
  }
  return [...postings].sort((left, right) => left - right);
}

function isFormOfEntry(senses: unknown, headTemplates: unknown): boolean {
  const structuredFormOf =
    Array.isArray(senses) &&
    senses.length > 0 &&
    senses.every((rawSense) => {
      if (typeof rawSense !== "object" || rawSense === null) {
        return false;
      }
      const sense = rawSense as { tags?: unknown; form_of?: unknown };
      return (
        (Array.isArray(sense.tags) && sense.tags.includes("form-of")) ||
        (Array.isArray(sense.form_of) && sense.form_of.length > 0)
      );
    });
  if (structuredFormOf) {
    return true;
  }
  return (
    Array.isArray(headTemplates) &&
    headTemplates.some((rawTemplate) => {
      if (typeof rawTemplate !== "object" || rawTemplate === null) {
        return false;
      }
      const args = (rawTemplate as { args?: unknown }).args;
      if (typeof args !== "object" || args === null) {
        return false;
      }
      const entryType = (args as Record<string, unknown>)["2"];
      return (
        typeof entryType === "string" &&
        /^(?:adjective|adverb|determiner|noun|numeral|participle|pronoun|verb) form$/u.test(
          entryType,
        )
      );
    })
  );
}

function buildFileMetadata(bytes: Uint8Array) {
  const chunkSize = 64 * 1024;
  const chunks = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(`sha256:${sha256(bytes.subarray(offset, offset + chunkSize))}`);
  }
  return {
    bytes: bytes.byteLength,
    digest: `sha256:${sha256(bytes)}`,
    chunkSize,
    chunks,
  };
}

function encodeUint32(values: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));
  return buffer;
}

function buildTable(mapping: Map<string, number[]>): {
  directory: Buffer;
  keys: Buffer;
  postings: Buffer;
} {
  const ordered = [...mapping].sort(([left], [right]) =>
    left.localeCompare(right, "ru"),
  );
  const keyParts: Buffer[] = [];
  const postingValues: number[] = [];
  const directory = Buffer.allocUnsafe(ordered.length * 16);
  let keyOffset = 0;
  for (const [index, [key, values]] of ordered.entries()) {
    const encodedKey = encodeIndexString(key);
    const keyBytes = Buffer.from(encodedKey.bytes);
    keyParts.push(keyBytes);
    const offset = index * 16;
    directory.writeUInt32LE(keyOffset, offset);
    directory.writeUInt16LE(keyBytes.byteLength, offset + 4);
    directory.writeUInt16LE(encodedKey.encoding, offset + 6);
    directory.writeUInt32LE(postingValues.length, offset + 8);
    directory.writeUInt32LE(values.length, offset + 12);
    postingValues.push(...values);
    keyOffset += keyBytes.byteLength;
  }
  return {
    directory,
    keys: Buffer.concat(keyParts),
    postings: encodeUint32(postingValues),
  };
}

const dedicatedStressBytes = await readFile(
  path.join(cacheDirectory, "stress-dictionary.bin"),
);
const dedicatedStress = new StressFsa(
  dedicatedStressBytes.buffer.slice(
    dedicatedStressBytes.byteOffset,
    dedicatedStressBytes.byteOffset + dedicatedStressBytes.byteLength,
  ),
);
const dedicatedStressConflicts = new Set<string>(
  JSON.parse(
    await readFile(
      path.resolve("public/indexes/stress/conflicts.json"),
      "utf8",
    ),
  ) as string[],
);
const dedicatedStressPatterns = new Map<string, Set<string>>();
const supplementalStressPatterns = new Map<string, Set<string>>();
const groups = new Map<string, Set<string>>();
const canonicalAlternatives = new Map<string, Set<string>>();
const explicitInflections = new Map<string, Set<string>>();
const grammaticalRelations = new Map<string, Map<string, Set<string>>>();
const aspectRelations = new Map<
  string,
  {
    aspect: "imperfective" | "perfective" | "biaspectual";
    counterparts: Set<string>;
  }
>();
let sourceRecords = 0;
let sourceForms = 0;
let excludedHeadwords = 0;
let excludedForms = 0;
let rejectedRecords = 0;
let formOfEntries = 0;
let excludedLexicalForms = 0;

function recordGrammar(surface: string, lemma: string, tags: unknown[]): void {
  const normalizedSurface = normalizeStressForm(surface);
  const byLemma =
    grammaticalRelations.get(normalizedSurface) ??
    new Map<string, Set<string>>();
  const analyses = byLemma.get(lemma) ?? new Set<string>();
  for (const grammarTags of expandGrammarTags(tags)) {
    analyses.add(JSON.stringify(grammarTags));
  }
  if (analyses.size === 0) {
    return;
  }
  byLemma.set(lemma, analyses);
  grammaticalRelations.set(normalizedSurface, byLemma);
}

function recordSupplementalStress(value: string): void {
  const form = normalizeSupplementalStressForm(value);
  if (!isRussianSurface(form)) {
    return;
  }
  const postings = stressPostings(value);
  if (postings.length === 0) {
    return;
  }
  const pattern = postings.join(",");
  let dedicatedPatterns = dedicatedStressPatterns.get(form);
  if (dedicatedPatterns === undefined) {
    dedicatedPatterns = new Set(
      dedicatedStress.lookup(form).map((candidate) => candidate.join(",")),
    );
    dedicatedStressPatterns.set(form, dedicatedPatterns);
  }
  if (dedicatedPatterns.has(pattern) && !dedicatedStressConflicts.has(form)) {
    return;
  }
  const patterns = supplementalStressPatterns.get(form) ?? new Set<string>();
  patterns.add(pattern);
  supplementalStressPatterns.set(form, patterns);
}

function readAspect(
  tags: unknown,
): "imperfective" | "perfective" | "biaspectual" | null {
  if (!Array.isArray(tags)) {
    return null;
  }
  const imperfective = tags.includes("imperfective");
  const perfective = tags.includes("perfective");
  if (imperfective && perfective) {
    return "biaspectual";
  }
  if (imperfective) {
    return "imperfective";
  }
  if (perfective) {
    return "perfective";
  }
  return tags.includes("biaspectual") ? "biaspectual" : null;
}

const lines = createInterface({
  input: createReadStream(sourcePath, { encoding: "utf8" }),
  crlfDelay: Number.POSITIVE_INFINITY,
});
for await (const line of lines) {
  sourceRecords += 1;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    rejectedRecords += 1;
    continue;
  }
  if (typeof raw !== "object" || raw === null) {
    rejectedRecords += 1;
    continue;
  }
  const record = raw as {
    word?: unknown;
    pos?: unknown;
    forms?: unknown;
    senses?: unknown;
    head_templates?: unknown;
  };
  if (typeof record.word !== "string") {
    rejectedRecords += 1;
    continue;
  }
  recordSupplementalStress(record.word);
  const lemma = normalizeStressSpelling(record.word);
  if (!isRussianSurface(normalizeStressForm(lemma))) {
    excludedHeadwords += 1;
    continue;
  }
  const formOfEntry = isFormOfEntry(record.senses, record.head_templates);
  const forms = groups.get(lemma) ?? new Set<string>();
  if (!formOfEntry) {
    forms.add(normalizeStressForm(record.word));
  }
  if (formOfEntry) {
    formOfEntries += 1;
  }
  const inflectionRelations = readInflectionRelations(record.senses);
  for (const target of readRelationTargets(record.senses, "alt_of")) {
    const surfaces = canonicalAlternatives.get(target) ?? new Set<string>();
    surfaces.add(normalizeStressForm(record.word));
    canonicalAlternatives.set(target, surfaces);
  }
  for (const relation of inflectionRelations) {
    const surfaces =
      explicitInflections.get(relation.target) ?? new Set<string>();
    surfaces.add(normalizeStressForm(record.word));
    explicitInflections.set(relation.target, surfaces);
    recordGrammar(record.word, lemma, relation.tags);
    recordGrammar(record.word, relation.target, relation.tags);
  }
  if (Array.isArray(record.forms)) {
    for (const rawForm of record.forms) {
      if (typeof rawForm !== "object" || rawForm === null) {
        excludedForms += 1;
        continue;
      }
      const formRecord = rawForm as {
        form?: unknown;
        source?: unknown;
        tags?: unknown;
      };
      const value = formRecord.form;
      if (typeof value !== "string" || value.length === 0) {
        excludedForms += 1;
        continue;
      }
      recordSupplementalStress(value);
      if (formOfEntry) {
        const tags = Array.isArray(formRecord.tags) ? formRecord.tags : [];
        if (!tags.includes("short-form")) {
          continue;
        }
        const form = normalizeStressForm(value);
        if (isRussianSurface(form)) {
          for (const relation of inflectionRelations) {
            const surfaces =
              explicitInflections.get(relation.target) ?? new Set<string>();
            surfaces.add(form);
            explicitInflections.set(relation.target, surfaces);
          }
          sourceForms += 1;
        } else {
          excludedForms += 1;
        }
        continue;
      }
      const form = normalizeStressForm(value);
      if (isRussianSurface(form)) {
        const tags = Array.isArray(formRecord.tags) ? formRecord.tags : [];
        const aspect = record.pos === "verb" ? readAspect(tags) : null;
        const canonical =
          tags.includes("canonical") || form === normalizeStressForm(lemma);
        const aspectPartner =
          aspect !== null && !canonical && formRecord.source !== "conjugation";
        if (canonical && aspect !== null) {
          const relation = aspectRelations.get(lemma) ?? {
            aspect,
            counterparts: new Set<string>(),
          };
          relation.aspect = aspect;
          aspectRelations.set(lemma, relation);
        } else if (aspectPartner) {
          const relation = aspectRelations.get(lemma);
          if (relation !== undefined) {
            relation.counterparts.add(normalizeStressSpelling(value));
          } else {
            aspectRelations.set(lemma, {
              aspect:
                aspect === "perfective"
                  ? "imperfective"
                  : aspect === "imperfective"
                    ? "perfective"
                    : "biaspectual",
              counterparts: new Set([normalizeStressSpelling(value)]),
            });
          }
          continue;
        }
        if (record.pos === "pron" && !canonical) {
          excludedForms += 1;
          continue;
        }
        if (
          isLexicalRelativeForm(record.pos, formRecord.source, tags) &&
          !canonical
        ) {
          excludedForms += 1;
          excludedLexicalForms += 1;
          continue;
        }
        forms.add(form);
        if (
          formRecord.source === "declension" ||
          formRecord.source === "conjugation"
        ) {
          recordGrammar(form, lemma, tags);
        }
        sourceForms += 1;
      } else {
        excludedForms += 1;
      }
    }
  }
  if (forms.size > 0) {
    groups.set(lemma, forms);
  }
}
for (const [lemma, surfaces] of explicitInflections) {
  const forms =
    groups.get(lemma) ?? new Set<string>([normalizeStressForm(lemma)]);
  for (const surface of surfaces) {
    forms.add(surface);
  }
  groups.set(lemma, forms);
}

for (const [lemma, surfaces] of canonicalAlternatives) {
  const forms =
    groups.get(lemma) ?? new Set<string>([normalizeStressForm(lemma)]);
  for (const surface of surfaces) {
    forms.add(surface);
  }
  groups.set(lemma, forms);
}

const originalSurfaces = new Set(
  [...groups.values()].flatMap((forms) => [...forms]),
);
for (const forms of groups.values()) {
  for (const form of [...forms]) {
    const folded = form.replaceAll("ё", "е");
    if (!originalSurfaces.has(folded)) {
      forms.add(folded);
    }
  }
}

const originalGrammarSurfaces = new Set(grammaticalRelations.keys());
for (const [surface, byLemma] of [...grammaticalRelations]) {
  const folded = surface.replaceAll("ё", "е");
  if (folded === surface || originalGrammarSurfaces.has(folded)) {
    continue;
  }
  const foldedByLemma =
    grammaticalRelations.get(folded) ?? new Map<string, Set<string>>();
  for (const [lemma, analyses] of byLemma) {
    const foldedAnalyses = foldedByLemma.get(lemma) ?? new Set<string>();
    for (const analysis of analyses) {
      foldedAnalyses.add(analysis);
    }
    foldedByLemma.set(lemma, foldedAnalyses);
  }
  grammaticalRelations.set(folded, foldedByLemma);
}

const lemmas = [...groups.keys()].sort((left, right) =>
  left.localeCompare(right, "ru"),
);
const paradigms: string[][] = [];
const paradigmIds = new Map<string, number>();
const descriptors: number[] = [];
const stemIndex = new Map<string, number[]>();
const exceptions = new Map<string, number[]>();
let encodedGroups = 0;
let exceptionGroups = 0;
let relationCount = 0;
let semanticMismatches = 0;
let ambiguousSurfaces = 0;
const surfaceOwners = new Map<string, number>();

for (const [lemmaId, lemma] of lemmas.entries()) {
  const forms = [...(groups.get(lemma) ?? [])].sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
  relationCount += forms.length;
  for (const form of forms) {
    const owner = surfaceOwners.get(form);
    if (owner === undefined) {
      surfaceOwners.set(form, lemmaId);
    } else if (owner >= 0 && owner !== lemmaId) {
      surfaceOwners.set(form, -1);
      ambiguousSurfaces += 1;
    }
  }
  const stem = commonPrefix(forms);
  if (stem.length === 0 || forms.length < 2) {
    exceptionGroups += 1;
    for (const form of forms) {
      const values = exceptions.get(form) ?? [];
      values.push(lemmaId);
      exceptions.set(form, values);
    }
    continue;
  }

  const suffixes = forms.map((form) => form.slice(stem.length));
  const paradigmKey = JSON.stringify(suffixes);
  let paradigmId = paradigmIds.get(paradigmKey);
  if (paradigmId === undefined) {
    paradigmId = paradigms.length;
    paradigms.push(suffixes);
    paradigmIds.set(paradigmKey, paradigmId);
  }
  const descriptorId = descriptors.length / 2;
  descriptors.push(paradigmId, lemmaId);
  const descriptorIds = stemIndex.get(stem) ?? [];
  descriptorIds.push(descriptorId);
  stemIndex.set(stem, descriptorIds);
  encodedGroups += 1;

  const reconstructed = suffixes.map((suffix) => stem + suffix);
  if (JSON.stringify(reconstructed) !== JSON.stringify(forms)) {
    semanticMismatches += 1;
  }
}
if (semanticMismatches !== 0) {
  throw new Error(
    `Morphology reconstruction mismatches: ${semanticMismatches}`,
  );
}

const lemmaParts: Buffer[] = [];
const lemmaDirectory = Buffer.allocUnsafe(lemmas.length * 8);
let lemmaOffset = 0;
for (const [lemmaId, lemma] of lemmas.entries()) {
  const encodedLemma = encodeIndexString(lemma);
  const bytes = Buffer.from(encodedLemma.bytes);
  lemmaDirectory.writeUInt32LE(lemmaOffset, lemmaId * 8);
  lemmaDirectory.writeUInt32LE(
    bytes.byteLength +
      (encodedLemma.encoding === INDEX_STRING_ENCODING_UTF8 ? 0x80000000 : 0),
    lemmaId * 8 + 4,
  );
  lemmaParts.push(bytes);
  lemmaOffset += bytes.byteLength;
}

const stemTable = buildTable(stemIndex);
const exceptionTable = buildTable(exceptions);
const lemmaIds = new Map(lemmas.map((lemma, lemmaId) => [lemma, lemmaId]));
const aspectCodes = {
  imperfective: 1,
  perfective: 2,
  biaspectual: 3,
} as const;
const aspectIndex = new Map<string, number[]>();
let aspectCounterparts = 0;
for (const [lemma, relation] of aspectRelations) {
  const counterpartIds = [...relation.counterparts]
    .map((counterpart) => lemmaIds.get(counterpart))
    .filter((lemmaId): lemmaId is number => lemmaId !== undefined)
    .sort((left, right) => left - right);
  aspectCounterparts += counterpartIds.length;
  aspectIndex.set(lemma, [aspectCodes[relation.aspect], ...counterpartIds]);
}
const aspectTable = buildTable(aspectIndex);
const grammarSignatures = new Set<string>();
for (const byLemma of grammaticalRelations.values()) {
  for (const analyses of byLemma.values()) {
    for (const analysis of analyses) {
      grammarSignatures.add(analysis);
    }
  }
}
const grammarAnalyses = [...grammarSignatures]
  .map((signature) => JSON.parse(signature) as GrammarTag[])
  .sort((left, right) => {
    const limit = Math.min(left.length, right.length);
    for (let index = 0; index < limit; index += 1) {
      const difference =
        (grammarTagOrder.get(left[index] ?? "nominative") ?? 0) -
        (grammarTagOrder.get(right[index] ?? "nominative") ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }
    return left.length - right.length;
  });
const grammarAnalysisIds = new Map(
  grammarAnalyses.map((analysis, index) => [JSON.stringify(analysis), index]),
);
const grammarIndex = new Map<string, number[]>();
let grammarRelationCount = 0;
for (const [surface, byLemma] of grammaticalRelations) {
  const values: number[] = [];
  for (const [lemma, analyses] of [...byLemma].sort(([left], [right]) =>
    left.localeCompare(right, "ru"),
  )) {
    const lemmaId = lemmaIds.get(lemma);
    if (lemmaId === undefined) {
      continue;
    }
    for (const analysis of [...analyses].sort(
      (left, right) =>
        (grammarAnalysisIds.get(left) ?? 0) -
        (grammarAnalysisIds.get(right) ?? 0),
    )) {
      const analysisId = grammarAnalysisIds.get(analysis);
      if (analysisId !== undefined) {
        const packed = lemmaId * grammarAnalyses.length + analysisId;
        if (packed > 0xffffffff) {
          throw new Error("Grammar relation exceeds uint32 capacity");
        }
        values.push(packed);
        grammarRelationCount += 1;
      }
    }
  }
  if (values.length > 0) {
    grammarIndex.set(surface, values);
  }
}
const grammarTable = buildTable(grammarIndex);
const supplementalStress = new Map<string, number[]>();
const ambiguousStressKeys: string[] = [];
let ambiguousSupplementalStress = 0;
for (const [form, patterns] of supplementalStressPatterns) {
  if (patterns.size > 1) {
    ambiguousSupplementalStress += 1;
    ambiguousStressKeys.push(form);
  }
  const positions = new Set<number>();
  for (const pattern of patterns) {
    for (const value of pattern.split(",")) {
      if (value !== "") {
        positions.add(Number.parseInt(value, 10));
      }
    }
  }
  supplementalStress.set(
    form,
    [...positions].sort((left, right) => left - right),
  );
}
const stressTable = buildTable(supplementalStress);
const ambiguousStressBytes = Buffer.from(
  `${JSON.stringify(ambiguousStressKeys.sort((left, right) => left.localeCompare(right, "ru")))}\n`,
);
const files = new Map<string, Buffer>([
  ["stem-directory.bin", stemTable.directory],
  ["stem-keys.bin", stemTable.keys],
  ["stem-postings.bin", stemTable.postings],
  ["descriptors.bin", encodeUint32(descriptors)],
  ["paradigms.json", Buffer.from(`${JSON.stringify(paradigms)}\n`)],
  ["exception-directory.bin", exceptionTable.directory],
  ["exception-keys.bin", exceptionTable.keys],
  ["exception-postings.bin", exceptionTable.postings],
  ["aspect-directory.bin", aspectTable.directory],
  ["aspect-keys.bin", aspectTable.keys],
  ["aspect-postings.bin", aspectTable.postings],
  ["grammar-directory.bin", grammarTable.directory],
  ["grammar-keys.bin", grammarTable.keys],
  ["grammar-postings.bin", grammarTable.postings],
  [
    "grammar-analyses.json",
    Buffer.from(`${JSON.stringify(grammarAnalyses)}\n`),
  ],
  ["lemma-directory.bin", lemmaDirectory],
  ["lemmas.bin", Buffer.concat(lemmaParts)],
  ["stress-directory.bin", stressTable.directory],
  ["stress-keys.bin", stressTable.keys],
  ["stress-postings.bin", stressTable.postings],
  ["stress-ambiguous.json", ambiguousStressBytes],
]);

const fileMetadata = Object.fromEntries(
  [...files].map(([name, bytes]) => [name, buildFileMetadata(bytes)]),
);
const artifactHash = createHash("sha256");
for (const [name, bytes] of files) {
  artifactHash.update(name);
  artifactHash.update("\0");
  artifactHash.update(bytes);
}
const artifactDigest = artifactHash.digest("hex");
const sourceManifest = JSON.parse(
  await readFile(path.resolve("data/config/index-sources.json"), "utf8"),
) as {
  sources: Array<{
    id: string;
    revision: string;
    snapshotDate: string;
    expectedSha256: string;
    url: string;
  }>;
};
const source = sourceManifest.sources.find(
  ({ id }) => id === "kaikki-english-russian",
);
if (source === undefined) {
  throw new Error("Missing morphology source metadata");
}

const metadata = Buffer.from(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "morphology",
      stringEncoding: "windows-1251-with-utf-8-fallback",
      sourceRevision: source.revision,
      sourceDigest: `sha256:${source.expectedSha256}`,
      artifactDigest: `sha256:${artifactDigest}`,
      snapshotDate: source.snapshotDate,
      recordCount: relationCount,
      files: fileMetadata,
    },
    null,
    2,
  )}\n`,
);
files.set("metadata.json", metadata);

const compressedBytes =
  [...files.values()].reduce(
    (total, bytes) =>
      total + deflateRawSync(bytes, { level: 9 }).byteLength + 64,
    0,
  ) + 512;
if (compressedBytes > compressedBudget) {
  throw new Error(
    `Morphology package compressed size ${compressedBytes} exceeds ${compressedBudget}`,
  );
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });
for (const [name, bytes] of files) {
  await writeFile(path.join(outputDirectory, name), bytes);
}

const report = {
  schemaVersion: 1,
  source: {
    records: sourceRecords,
    forms: sourceForms,
  },
  recordFlow: {
    sourceRecordsSeen: sourceRecords,
    eligibleRecords: sourceRecords,
    emittedRecords: sourceRecords - rejectedRecords - excludedHeadwords,
    filteredRecords: excludedHeadwords,
    rejectedRecords,
  },
  index: {
    lemmas: lemmas.length,
    relations: relationCount,
    ambiguousSurfaces,
    encodedGroups,
    exceptionGroups,
    uniqueParadigms: paradigms.length,
    reusedParadigms: encodedGroups - paradigms.length,
    excludedForms,
    excludedLexicalForms,
    formOfEntries,
    aspectLemmas: aspectIndex.size,
    aspectCounterparts,
    grammarForms: grammarIndex.size,
    grammarRelations: grammarRelationCount,
    grammarAnalyses: grammarAnalyses.length,
    semanticMismatches,
    supplementalStressForms: supplementalStress.size,
    ambiguousSupplementalStress,
  },
  artifact: {
    files: files.size,
    installedBytes: [...files.values()].reduce(
      (total, bytes) => total + bytes.byteLength,
      0,
    ),
    compressedBytes,
    sha256: artifactDigest,
  },
};
await writeFile(
  path.join(generatedDirectory, "morphology-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  path.join(generatedDirectory, "morphology-quality.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: {
        url: source.url,
        snapshotDate: source.snapshotDate,
        digest: `sha256:${source.expectedSha256}`,
        extractorRevision: source.revision,
      },
      recordFlow: report.recordFlow,
      artifact: {
        kind: "morphology",
        bytes: report.artifact.installedBytes,
        digest: `sha256:${artifactDigest}`,
      },
    },
    null,
    2,
  )}\n`,
);
