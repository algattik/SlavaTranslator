const ACCENTED_LABELS = new Set([
  129, 131, 140, 144, 154, 156, 157, 158, 159, 161, 165, 178, 179, 186, 188,
  189, 190, 191,
]);

const BASE_LABELS = new Map([
  [129, 224],
  [131, 229],
  [140, 232],
  [144, 224],
  [154, 229],
  [156, 238],
  [157, 232],
  [158, 238],
  [159, 243],
  [161, 243],
  [165, 251],
  [178, 251],
  [179, 253],
  [184, 229],
  [186, 254],
  [188, 253],
  [189, 254],
  [190, 255],
  [191, 255],
]);

export const YO_POSITION_FLAG = 0x80000000;

export function decodeStressPostings(postings: number[]): {
  positions: number[];
  yoPositions: number[];
} {
  const positions: number[] = [];
  const yoPositions: number[] = [];
  for (const posting of postings) {
    if ((posting & YO_POSITION_FLAG) === 0) {
      positions.push(posting);
    } else {
      yoPositions.push(posting & ~YO_POSITION_FLAG);
    }
  }
  return { positions, yoPositions };
}

export function normalizeStressSpelling(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll("\u0301", "")
    .replaceAll("\u0300", "")
    .normalize("NFC")
    .replaceAll("\u2011", "-")
    .replaceAll("\u2019", "'");
}

export function normalizeStressForm(value: string): string {
  return normalizeStressSpelling(value).toLocaleLowerCase("ru");
}

export function normalizeSupplementalStressForm(value: string): string {
  return normalizeStressForm(value).replaceAll("ё", "е");
}

function inputCode(character: string): number | null {
  const value = character.codePointAt(0);
  if (value === undefined) {
    return null;
  }
  if (value === 1025) {
    return 168;
  }
  if (value === 1105) {
    return 184;
  }
  return value >= 1040 && value < 1104 ? value - 848 : null;
}

function baseLabel(label: number): number {
  return BASE_LABELS.get(label) ?? label;
}

export class StressFsa {
  private readonly values: DataView;
  private readonly edgeCount: number;

  constructor(bytes: ArrayBuffer) {
    if (bytes.byteLength % 4 !== 0) {
      throw new Error("Stress dictionary byte length is not divisible by four");
    }
    this.values = new DataView(bytes);
    this.edgeCount = bytes.byteLength / 4;
  }

  lookup(value: string): number[][] {
    const normalized = normalizeStressForm(value);
    if (normalized.length === 0) {
      return [];
    }
    const results: number[][] = [];
    this.visit(normalized, 0, 0, [], results);
    const unique = new Map(
      results.map((positions) => [positions.join(","), positions]),
    );
    return [...unique.values()].sort((left, right) => {
      const lengthDifference = left.length - right.length;
      return lengthDifference === 0
        ? left.join(",").localeCompare(right.join(","))
        : lengthDifference;
    });
  }

  private visit(
    normalized: string,
    nodeOffset: number,
    position: number,
    stresses: number[],
    results: number[][],
  ): void {
    const expected = inputCode(normalized[position] ?? "");
    if (expected === null || nodeOffset >= this.edgeCount) {
      return;
    }

    for (let edgeIndex = nodeOffset; edgeIndex < this.edgeCount; edgeIndex++) {
      const edge = this.values.getUint32(edgeIndex * 4, true);
      const label = edge >>> 24;
      if (baseLabel(label) === expected) {
        const nextStresses =
          ACCENTED_LABELS.has(label) || label === 184
            ? [...stresses, position]
            : stresses;
        const target = (edge & 0xffffff) >>> 2;
        if (position === normalized.length - 1) {
          if ((edge & 1) !== 0) {
            results.push([...new Set(nextStresses)].sort((a, b) => a - b));
          }
        } else {
          this.visit(normalized, target, position + 1, nextStresses, results);
        }
      }
      if ((edge & 2) !== 0) {
        return;
      }
    }
    throw new Error(`Unterminated stress node at ${nodeOffset}`);
  }
}

export function inherentYoStress(value: string): number[] {
  return [...normalizeStressForm(value)]
    .map((character, index) => (character === "ё" ? index : -1))
    .filter((index) => index >= 0);
}
