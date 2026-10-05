import type {
  DefinitionEdition,
  DefinitionEntry,
} from "../contracts/definition";

export type ParseResult =
  | { kind: "success"; entries: DefinitionEntry[] }
  | { kind: "no-russian-entry" }
  | { kind: "api-changed" };

const PARTS_OF_SPEECH: Record<
  Exclude<DefinitionEdition, "ru" | "uk" | "ko" | "he" | "pl" | "lv">,
  Set<string>
> = {
  en: new Set([
    "Adjective",
    "Adverb",
    "Conjunction",
    "Determiner",
    "Interjection",
    "Letter",
    "Noun",
    "Numeral",
    "Participle",
    "Particle",
    "Phrase",
    "Postposition",
    "Preposition",
    "Predicative",
    "Pronoun",
    "Proper noun",
    "Proverb",
    "Symbol",
    "Verb",
  ]),
  fr: new Set([
    "Adjectif",
    "Adverbe",
    "Conjonction",
    "Déterminant",
    "Interjection",
    "Locution",
    "Nom commun",
    "Nom propre",
    "Numéral",
    "Particule",
    "Préposition",
    "Pronom",
    "Verbe",
  ]),
  de: new Set([
    "Adjektiv",
    "Adverb",
    "Artikel",
    "Interjektion",
    "Konjunktion",
    "Numerale",
    "Partikel",
    "Postposition",
    "Präposition",
    "Pronomen",
    "Redewendung",
    "Substantiv",
    "Verb",
  ]),
  es: new Set([
    "Adjetivo",
    "Adverbio",
    "Conjunción",
    "Interjección",
    "Locución",
    "Numeral",
    "Partícula",
    "Preposición",
    "Pronombre",
    "Sustantivo",
    "Verbo",
    "Verbo imperfectivo",
    "Verbo perfectivo",
  ]),
  pt: new Set([
    "Adjetivo",
    "Advérbio",
    "Conjunção",
    "Interjeição",
    "Locução",
    "Numeral",
    "Partícula",
    "Preposição",
    "Pronome",
    "Substantivo",
    "Verbo",
  ]),
  zh: new Set([
    "介詞",
    "前綴",
    "代詞",
    "副詞",
    "字母",
    "動詞",
    "名詞",
    "形容詞",
    "感嘆詞",
    "數詞",
    "短語",
  ]),
  ja: new Set([
    "代名詞",
    "副詞",
    "動詞",
    "名詞",
    "形容詞",
    "感動詞",
    "数詞",
    "成句",
  ]),
  ar: new Set([
    "اسم",
    "اسم علم",
    "صفة",
    "ظرف",
    "ضمير",
    "فعل",
    "حرف جر",
    "عبارة",
  ]),
  hi: new Set([
    "क्रिया",
    "विशेषण",
    "क्रिया-विशेषण",
    "सर्वनाम",
    "संज्ञा",
    "नामवाचक संज्ञा",
  ]),
  ro: new Set([
    "Adjectiv",
    "Adverb",
    "Conjuncție",
    "Interjecție",
    "Numeral",
    "Prepoziție",
    "Pronume",
    "Substantiv",
    "Verb",
  ]),
  tr: new Set([
    "Ad",
    "Bağlaç",
    "Belirteç",
    "Edat",
    "Eylem",
    "Ön ad",
    "Ünlem",
    "Zamir",
  ]),
  it: new Set([
    "Aggettivo",
    "Avverbio",
    "Congiunzione",
    "Interiezione",
    "Locuzione",
    "Nome",
    "Numerale",
    "Preposizione",
    "Pronome",
    "Sostantivo",
    "Verbo",
  ]),
  kk: new Set([
    "Еліктеу сөз",
    "Есімдік",
    "Зат есім",
    "Одағай",
    "Сан есім",
    "Сын есім",
    "Үстеу",
    "Етістік",
  ]),
  et: new Set([
    "Arvsõna",
    "Asesõna",
    "Hüüdsõna",
    "Kaassõna",
    "Määrsõna",
    "Nimisõna",
    "Omadussõna",
    "Sidesõna",
    "Tegusõna",
  ]),
  lt: new Set([
    "Būdvardis",
    "Dalelytė",
    "Jungtukas",
    "Prieveiksmis",
    "Prielinksnis",
    "Skaitvardis",
    "Veiksmažodis",
    "Įvardis",
    "Šauktukas",
    "Daiktavardis",
  ]),
};

function headingLevel(element: Element): number | null {
  const heading = /^H[1-6]$/.test(element.tagName)
    ? element
    : element.querySelector(
        ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6",
      );
  const match = heading === null ? null : /^H([1-6])$/.exec(heading.tagName);
  return match === null ? null : Number.parseInt(match[1] ?? "", 10);
}

function headingText(element: Element): string {
  const heading = /^H[1-6]$/.test(element.tagName)
    ? element
    : element.querySelector(
        ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6",
      );
  return normalizeText(heading?.textContent ?? "");
}

function normalizedPartOfSpeechHeading(value: string): string {
  return value.replace(/\s+\d+$/u, "");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function directSenseText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const nested of clone.querySelectorAll(
    "ul, ol, dl, blockquote, form, input, button, textarea, select, option, iframe, object, embed, svg, math, .example, .example-fullblock, .h-usage-example, .usage-example, .citation, .reference, sup, style, script, img, audio, video",
  )) {
    nested.remove();
  }
  return normalizeText(clone.textContent ?? "").replace(
    /^(?:\[\d+\]|\d+\.)\s*/u,
    "",
  );
}

function sectionElements(root: Element): Element[] {
  const boundary =
    root.parentElement?.classList.contains("mw-heading") === true
      ? root.parentElement
      : root;
  const level = headingLevel(boundary);
  if (level === null) {
    return [];
  }
  const elements: Element[] = [];
  let current = boundary.nextElementSibling;
  while (current !== null) {
    const currentLevel = headingLevel(current);
    if (currentLevel !== null && currentLevel <= level) {
      break;
    }
    elements.push(current);
    current = current.nextElementSibling;
  }
  return elements;
}

function findRussianSection(
  document: Document,
  edition: DefinitionEdition,
): Element | null {
  const selectors: Partial<Record<DefinitionEdition, string>> = {
    en: "h2#Russian",
    fr: "h2#Russe",
    ru: "h1#Русский",
    uk: "h1#Російська",
    es: "h2#Ruso",
    pt: "h1#Russo",
    zh: "h2#俄語",
    ja: "h2#ロシア語",
    ko: "h2#러시아어",
    ar: "h2#روسية",
    hi: "h2#रूसी",
    he: "h2#רוסית",
    ro: "h2#rusă",
    tr: "h2#Rusça",
    it: "h2#Russo",
    kk: "h2#Орысша",
    lv: "h2#Krievu_valoda",
    et: "h2#Vene",
    lt: "h2#_Rusų_kalba",
  };
  if (edition === "pl") {
    return (
      [...document.querySelectorAll("h2")].find((heading) =>
        normalizeText(heading.textContent ?? "").includes("język rosyjski"),
      ) ?? null
    );
  }
  if (edition === "de") {
    return (
      [...document.querySelectorAll("h2")].find((heading) =>
        normalizeText(heading.textContent ?? "").endsWith("(Russisch)"),
      ) ?? null
    );
  }
  return document.querySelector(selectors[edition] ?? "");
}

function parseOrderedLists(
  section: Element,
  edition: Exclude<DefinitionEdition, "de" | "es" | "ko" | "he" | "pl">,
): DefinitionEntry[] {
  const entries: DefinitionEntry[] = [];
  let partOfSpeech: string | null = null;
  let meaningScope = false;
  for (const element of sectionElements(section)) {
    const level = headingLevel(element);
    if (level !== null) {
      const heading = headingText(element);
      if (edition === "ru" || edition === "uk" || edition === "lv") {
        const meaningHeading =
          edition === "ru"
            ? "Значение"
            : edition === "uk"
              ? "Значення"
              : "Skaidrojums";
        meaningScope = heading === meaningHeading;
      } else {
        const normalizedHeading = normalizedPartOfSpeechHeading(heading);
        const isPartOfSpeech = PARTS_OF_SPEECH[edition].has(normalizedHeading);
        partOfSpeech = isPartOfSpeech ? normalizedHeading : null;
        meaningScope = isPartOfSpeech;
      }

      continue;
    }
    if (!meaningScope || element.tagName !== "OL") {
      continue;
    }
    const senses = [...element.children]
      .filter((child) => child.tagName === "LI")
      .map(directSenseText)
      .filter((sense) => sense.length > 0);
    if (senses.length > 0) {
      entries.push({ partOfSpeech, senses });
    }
    meaningScope = false;
  }
  return entries;
}

function parseDirectOrderedList(section: Element): DefinitionEntry[] {
  for (const element of sectionElements(section)) {
    if (element.tagName !== "OL") {
      continue;
    }
    const senses = [...element.children]
      .filter((child) => child.tagName === "LI")
      .map(directSenseText)
      .filter((sense) => sense.length > 0);
    if (senses.length > 0) {
      return [{ partOfSpeech: null, senses }];
    }
  }
  return [];
}

function parsePolish(section: Element): DefinitionEntry[] {
  const elements = sectionElements(section);
  const meaningIndex = elements.findIndex(
    (element) =>
      element.tagName === "DL" &&
      element.querySelector('[data-field="znaczenia"]') !== null,
  );
  if (meaningIndex < 0) {
    return [];
  }
  for (const element of elements.slice(meaningIndex + 1)) {
    if (headingLevel(element) !== null) {
      break;
    }
    if (element.tagName !== "DL") {
      continue;
    }
    const senses = [...element.children]
      .filter((child) => child.tagName === "DD")
      .map(directSenseText)
      .filter((sense) => sense.length > 0);
    if (senses.length > 0) {
      return [{ partOfSpeech: null, senses }];
    }
  }
  return [];
}

function parseSpanish(section: Element): DefinitionEntry[] {
  const entries: DefinitionEntry[] = [];
  let partOfSpeech: string | null = null;
  for (const element of sectionElements(section)) {
    const level = headingLevel(element);
    if (level !== null) {
      const heading = normalizedPartOfSpeechHeading(headingText(element));
      partOfSpeech = PARTS_OF_SPEECH.es.has(heading) ? heading : null;
      continue;
    }
    if (partOfSpeech === null || element.tagName !== "DL") {
      continue;
    }
    const senses = [...element.children]
      .filter((child) => child.tagName === "DD")
      .map(directSenseText)
      .filter((sense) => sense.length > 0);
    if (senses.length > 0) {
      entries.push({ partOfSpeech, senses });
    }
  }
  return entries;
}

function parseKorean(section: Element): DefinitionEntry[] {
  for (const element of sectionElements(section)) {
    if (element.tagName !== "UL") {
      continue;
    }
    const senses = [...element.children]
      .filter(
        (child) =>
          child.tagName === "LI" &&
          /^\s*\d+\./u.test(normalizeText(child.textContent ?? "")),
      )
      .map(directSenseText)
      .filter((sense) => sense.length > 0);
    if (senses.length > 0) {
      return [{ partOfSpeech: null, senses }];
    }
  }
  return [];
}

function parseGerman(section: Element): DefinitionEntry[] {
  const entries: DefinitionEntry[] = [];
  let partOfSpeech: string | null = null;
  let expectDefinitions = false;
  for (const element of sectionElements(section)) {
    const level = headingLevel(element);
    if (level !== null) {
      const heading = headingText(element);
      partOfSpeech = PARTS_OF_SPEECH.de.has(heading) ? heading : null;
      expectDefinitions = false;
      continue;
    }
    if (
      element.tagName === "P" &&
      partOfSpeech !== null &&
      normalizeText(element.textContent ?? "") === "Bedeutungen:"
    ) {
      expectDefinitions = true;
      continue;
    }
    if (expectDefinitions && element.tagName === "DL") {
      const senses = [...element.children]
        .filter((child) => child.tagName === "DD")
        .map(directSenseText)
        .filter((sense) => sense.length > 0);
      if (senses.length > 0) {
        entries.push({ partOfSpeech, senses });
      }
      expectDefinitions = false;
    }
  }
  return entries;
}

export function parseWiktionaryHtml(
  edition: DefinitionEdition,
  html: string,
): ParseResult {
  const document = new DOMParser().parseFromString(html, "text/html");
  const section = findRussianSection(document, edition);
  if (section === null) {
    return { kind: "no-russian-entry" };
  }
  const entries =
    edition === "de"
      ? parseGerman(section)
      : edition === "es"
        ? parseSpanish(section)
        : edition === "ko"
          ? parseKorean(section)
          : edition === "he"
            ? parseDirectOrderedList(section)
            : edition === "pl"
              ? parsePolish(section)
              : parseOrderedLists(section, edition);
  return entries.length > 0
    ? { kind: "success", entries }
    : { kind: "api-changed" };
}
