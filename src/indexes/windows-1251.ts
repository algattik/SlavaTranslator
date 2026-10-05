const decoder = new TextDecoder("windows-1251", { fatal: true });
let encodingTable: Map<string, number> | null = null;

function getEncodingTable(): Map<string, number> {
  if (encodingTable !== null) {
    return encodingTable;
  }
  const table = new Map<string, number>();
  for (let byte = 0; byte <= 0xff; byte += 1) {
    try {
      const character = decoder.decode(Uint8Array.of(byte));
      if (character !== "\ufffd") {
        table.set(character, byte);
      }
    } catch {
      // Windows-1251 leaves one byte undefined.
    }
  }
  encodingTable = table;
  return table;
}

export function encodeWindows1251(value: string): Uint8Array {
  const table = getEncodingTable();
  return Uint8Array.from([...value], (character) => {
    const byte = table.get(character);
    if (byte === undefined) {
      throw new Error(
        `Character ${JSON.stringify(character)} is not Windows-1251 encodable`,
      );
    }
    return byte;
  });
}

export function decodeWindows1251(value: Uint8Array): string {
  return decoder.decode(value);
}

export const INDEX_STRING_ENCODING_WINDOWS_1251 = 0;
export const INDEX_STRING_ENCODING_UTF8 = 1;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeIndexString(value: string): {
  bytes: Uint8Array;
  encoding: 0 | 1;
} {
  try {
    return {
      bytes: encodeWindows1251(value),
      encoding: INDEX_STRING_ENCODING_WINDOWS_1251,
    };
  } catch {
    return {
      bytes: utf8Encoder.encode(value),
      encoding: INDEX_STRING_ENCODING_UTF8,
    };
  }
}

export function decodeIndexString(value: Uint8Array, encoding: number): string {
  if (encoding === INDEX_STRING_ENCODING_WINDOWS_1251) {
    return decodeWindows1251(value);
  }
  if (encoding === INDEX_STRING_ENCODING_UTF8) {
    return utf8Decoder.decode(value);
  }
  throw new Error(`Unsupported index string encoding ${encoding}`);
}
