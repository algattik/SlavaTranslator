import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL, URLSearchParams } from "node:url";

const requestedTitles = {
  en: "говорить",
  ru: "говорить",
  uk: "говорить",
  de: "говорить",
  fr: "говорить",
  es: "идти",
  pt: "говорить",
  zh: "говорить",
  ja: "говорить",
  ko: "говорить",
  ar: "говорить",
  hi: "Россия",
  he: "сила",
  pl: "говорить",
  ro: "Россия",
  tr: "говорить",
  it: "говорить",
  kk: "Россия",
  lv: "Россия",
  et: "говорить",
  lt: "говорить",
};
const requestedEditions =
  globalThis.process.argv.length > 2
    ? globalThis.process.argv.slice(2)
    : Object.keys(requestedTitles);
const outputDirectory = path.resolve("tests/fixtures/mediawiki");
const userAgent =
  "SlavaRussianDictionaryFixtureCapture/0.1 (https://github.com/algattik/SlavaTranslator)";

function buildUrl(edition, title) {
  const url = new URL(`https://${edition}.wiktionary.org/w/api.php`);
  url.search = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "text|tocdata|revid|displaytitle",
    format: "json",
    formatversion: "2",
    redirects: "1",
    origin: "*",
    disableeditsection: "1",
    disablelimitreport: "1",
  }).toString();
  return url;
}

async function capture(edition, title, scenario, fixtureName) {
  const url = buildUrl(edition, title);
  const response = await globalThis.fetch(url, {
    headers: {
      "Api-User-Agent": userAgent,
    },
    signal: globalThis.AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`${edition} returned HTTP ${response.status}`);
  }

  const text = await response.text();
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) {
    throw new Error(`${edition} response exceeded 2 MiB`);
  }

  const payload = JSON.parse(text);
  const fixture = {
    metadata: {
      schemaVersion: 1,
      edition,
      requestedTitle: title,
      resolvedTitle: payload.parse?.title ?? null,
      revisionId: payload.parse?.revid ?? null,
      retrievedAt: new Date().toISOString(),
      sourceUrl: url.toString(),
      license:
        "Wiktionary content; CC BY-SA and GFDL terms apply for the source edition",
      scenario,
    },
    response: payload,
  };

  const editionDirectory = path.join(outputDirectory, edition);
  await mkdir(editionDirectory, { recursive: true });
  await writeFile(
    path.join(editionDirectory, `${fixtureName}.json`),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
}

for (const edition of requestedEditions) {
  const requestedTitle = requestedTitles[edition];
  if (requestedTitle === undefined) {
    throw new Error(`Unsupported Wiktionary edition: ${edition}`);
  }
  await capture(edition, requestedTitle, "usable", requestedTitle);
}
if (globalThis.process.argv.length <= 2) {
  await capture("en", "должен", "usable", "должен");
  await capture("zh", "с", "usable", "с");
  await capture("fr", "драйвер", "usable", "драйвер");
  await capture("de", "электрификация", "missing", "missing");
}
