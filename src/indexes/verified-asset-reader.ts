import type { LocalIndexMetadata } from "../contracts/local-index";

async function digest(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const result = await crypto.subtle.digest("SHA-256", copy.buffer);
  return `sha256:${[...new Uint8Array(result)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export class VerifiedAssetReader {
  private readonly chunks = new Map<string, Uint8Array>();

  constructor(
    private readonly baseUrl: string,
    private readonly metadata: LocalIndexMetadata,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly maximumCachedChunks = 64,
  ) {}

  async readAll(name: string): Promise<ArrayBuffer> {
    const file = this.getFile(name);
    const response = await this.fetcher(new URL(name, this.baseUrl));
    if (!response.ok) {
      throw new Error(`${name} returned HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength !== file.bytes ||
      (await digest(bytes)) !== file.digest
    ) {
      throw new Error(`${name} failed integrity verification`);
    }
    return bytes.buffer;
  }

  async readRange(
    name: string,
    start: number,
    length: number,
  ): Promise<ArrayBuffer> {
    const file = this.getFile(name);
    if (start < 0 || length < 0 || start + length > file.bytes) {
      throw new Error(`Invalid ${name} range`);
    }
    if (length === 0) {
      return new ArrayBuffer(0);
    }

    const firstChunk = Math.floor(start / file.chunkSize);
    const lastChunk = Math.floor((start + length - 1) / file.chunkSize);
    const chunks = await Promise.all(
      Array.from({ length: lastChunk - firstChunk + 1 }, (_, index) =>
        this.readChunk(name, firstChunk + index),
      ),
    );
    const combined = new Uint8Array(
      chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const sliceStart = start - firstChunk * file.chunkSize;
    return combined.slice(sliceStart, sliceStart + length).buffer;
  }

  get diagnostics(): { cachedChunks: number } {
    return { cachedChunks: this.chunks.size };
  }

  private getFile(name: string) {
    const file = this.metadata.files[name];
    if (file === undefined) {
      throw new Error(`Undeclared index file ${name}`);
    }
    return file;
  }

  private async readChunk(
    name: string,
    chunkIndex: number,
  ): Promise<Uint8Array> {
    const cacheKey = `${name}:${chunkIndex}`;
    const cached = this.chunks.get(cacheKey);
    if (cached !== undefined) {
      this.chunks.delete(cacheKey);
      this.chunks.set(cacheKey, cached);
      return cached;
    }

    const file = this.getFile(name);
    const start = chunkIndex * file.chunkSize;
    const end = Math.min(file.bytes, start + file.chunkSize) - 1;
    const response = await this.fetcher(new URL(name, this.baseUrl), {
      headers: { Range: `bytes=${start}-${end}` },
    });
    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`${name} range returned HTTP ${response.status}`);
    }
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    let bytes: Uint8Array;
    const expectedLength = end - start + 1;
    if (
      response.status === 206 ||
      (response.status === 200 && responseBytes.byteLength === expectedLength)
    ) {
      bytes = responseBytes;
    } else {
      if (
        responseBytes.byteLength !== file.bytes ||
        (await digest(responseBytes)) !== file.digest
      ) {
        throw new Error(`${name} full response failed integrity verification`);
      }
      for (
        let offset = 0, index = 0;
        offset < responseBytes.byteLength;
        offset += file.chunkSize, index += 1
      ) {
        this.cacheChunk(
          `${name}:${index}`,
          responseBytes.slice(offset, offset + file.chunkSize),
        );
      }
      const populated = this.chunks.get(cacheKey);
      if (populated === undefined) {
        throw new Error(`${name} did not populate requested chunk`);
      }
      return populated;
    }

    if (
      bytes.byteLength !== expectedLength ||
      (await digest(bytes)) !== file.chunks[chunkIndex]
    ) {
      throw new Error(`${name} chunk ${chunkIndex} failed verification`);
    }
    this.cacheChunk(cacheKey, bytes);
    return bytes;
  }

  private cacheChunk(key: string, bytes: Uint8Array): void {
    this.chunks.set(key, bytes);
    while (this.chunks.size > this.maximumCachedChunks) {
      const oldest = this.chunks.keys().next().value;
      if (typeof oldest !== "string") {
        break;
      }
      this.chunks.delete(oldest);
    }
  }
}

export async function loadIndexMetadata(
  baseUrl: string,
  expectedKind: LocalIndexMetadata["kind"],
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<LocalIndexMetadata> {
  const response = await fetcher(new URL("metadata.json", baseUrl));
  if (!response.ok) {
    throw new Error(`Index metadata returned HTTP ${response.status}`);
  }
  const metadata = (await response.json()) as LocalIndexMetadata;
  if (
    metadata.schemaVersion !== 1 ||
    metadata.kind !== expectedKind ||
    (expectedKind === "morphology" &&
      metadata.stringEncoding !== "windows-1251-with-utf-8-fallback") ||
    typeof metadata.files !== "object"
  ) {
    throw new Error(`Unsupported ${expectedKind} metadata`);
  }
  return metadata;
}
