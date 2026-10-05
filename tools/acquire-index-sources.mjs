import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const manifestPath = path.resolve("data/config/index-sources.json");
const policyPath = path.resolve("data/config/index-policy.json");
const cacheDirectory = path.resolve(
  process.env.SLAVA_SOURCE_CACHE ?? ".cache/slava-sources",
);
const outputPath = path.resolve(
  process.env.SLAVA_PROVENANCE_OUTPUT ??
    "data/generated/source-provenance.json",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(filePath) {
  const handle = await open(filePath, "r");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(chunk);
      bytes += chunk.byteLength;
    }
  } finally {
    await handle.close();
  }
  return { bytes, sha256: hash.digest("hex") };
}

function assertSource(source) {
  if (
    typeof source.id !== "string" ||
    typeof source.fileName !== "string" ||
    typeof source.url !== "string" ||
    typeof source.revision !== "string" ||
    typeof source.expectedBytes !== "number" ||
    !/^[a-f0-9]{64}$/.test(source.expectedSha256)
  ) {
    throw new Error("Source manifest contains an incomplete source");
  }
  const url = new URL(source.url);
  if (url.protocol !== "https:") {
    throw new Error(`${source.id} must use HTTPS`);
  }
  if (source.fileName !== path.basename(source.fileName)) {
    throw new Error(`${source.id} has an unsafe file name`);
  }
}

function verifyIdentity(source, identity) {
  if (
    identity.bytes !== source.expectedBytes ||
    identity.sha256 !== source.expectedSha256
  ) {
    throw new Error(
      `${source.id} integrity mismatch: expected ${source.expectedBytes} bytes/${source.expectedSha256}, got ${identity.bytes} bytes/${identity.sha256}`,
    );
  }
}

async function download(source, target) {
  const response = await globalThis.fetch(source.url, {
    headers: {
      "User-Agent":
        "SlavaRussianDictionaryIndexBuilder/0.1 (https://github.com/algattik/SlavaTranslator)",
    },
    redirect: "follow",
  });
  if (!response.ok || response.body === null) {
    throw new Error(`${source.id} returned HTTP ${response.status}`);
  }
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== "https:") {
    throw new Error(`${source.id} redirected outside HTTPS`);
  }
  const contentLength = response.headers.get("content-length");
  if (
    response.headers.get("content-encoding") === null &&
    contentLength !== null &&
    Number.parseInt(contentLength, 10) !== source.expectedBytes
  ) {
    throw new Error(`${source.id} content length changed`);
  }
  if (
    source.expectedEtag !== undefined &&
    response.headers.get("etag") !== source.expectedEtag
  ) {
    throw new Error(`${source.id} ETag changed`);
  }

  const temporary = `${target}.partial`;
  await rm(temporary, { force: true });
  const handle = await open(temporary, "wx");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      await handle.write(chunk);
      hash.update(chunk);
      bytes += chunk.byteLength;
      if (bytes > source.expectedBytes) {
        throw new Error(`${source.id} exceeded its expected byte length`);
      }
    }
  } catch (error) {
    await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  const identity = { bytes, sha256: hash.digest("hex") };
  verifyIdentity(source, identity);
  await rename(temporary, target);
  return identity;
}

const manifestBytes = await readFile(manifestPath);
const policyBytes = await readFile(policyPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (
  manifest.schemaVersion !== 1 ||
  !Array.isArray(manifest.sources) ||
  manifest.sources.length === 0
) {
  throw new Error("Unsupported or empty source manifest");
}

await mkdir(cacheDirectory, { recursive: true });
const resolvedSources = [];
for (const source of manifest.sources) {
  assertSource(source);
  const target = path.join(cacheDirectory, source.fileName);
  let identity;
  try {
    identity = await hashFile(target);
    verifyIdentity(source, identity);
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes("ENOENT") &&
      !error.message.includes("integrity mismatch")
    ) {
      throw error;
    }
    await rm(target, { force: true });
    identity = await download(source, target);
  }
  resolvedSources.push({
    id: source.id,
    purpose: source.purpose,
    cacheFile: source.fileName,
    revision: source.revision,
    snapshotDate: source.snapshotDate,
    bytes: identity.bytes,
    sha256: identity.sha256,
    license: source.license,
  });
}

const provenance = {
  schemaVersion: 1,
  manifest: {
    path: path.relative(process.cwd(), manifestPath),
    sha256: sha256(manifestBytes),
  },
  policy: {
    path: path.relative(process.cwd(), policyPath),
    sha256: sha256(policyBytes),
    packagedDefinitionFields: [],
  },
  toolchain: {
    node: ">=22",
    packageManager: "npm@11.19.1",
    acquisitionTool: "tools/acquire-index-sources.mjs",
    acquisitionToolSha256: await hashFile(
      path.resolve("tools/acquire-index-sources.mjs"),
    ).then((identity) => identity.sha256),
  },
  sources: resolvedSources,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(provenance, null, 2)}\n`);
process.stdout.write(`${outputPath}\n`);
