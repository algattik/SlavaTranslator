import { MAX_LEMMA_CODE_POINTS } from "../contracts/definition";

const CYRILLIC_WORD =
  /^[\p{Script=Cyrillic}\p{Mark}]+(?:[-'’][\p{Script=Cyrillic}\p{Mark}]+)*$/u;

export class InvalidLemmaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLemmaError";
  }
}

export function normalizeLemma(value: string): string {
  const normalized = value.normalize("NFC").trim();
  const codePointCount = [...normalized].length;

  if (codePointCount === 0) {
    throw new InvalidLemmaError("Lemma must not be empty");
  }
  if (codePointCount > MAX_LEMMA_CODE_POINTS) {
    throw new InvalidLemmaError("Lemma is too long");
  }
  if (/[\p{Cc}\p{Cf}\r\n]/u.test(normalized)) {
    throw new InvalidLemmaError("Lemma contains control characters");
  }
  if (!CYRILLIC_WORD.test(normalized)) {
    throw new InvalidLemmaError("Lemma must be one Cyrillic word");
  }

  return normalized;
}
