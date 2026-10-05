import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page, Request } from "@playwright/test";

import { WIKTIONARY_HOSTS } from "../../src/config/wiktionary-hosts";
import type { DefinitionEdition } from "../../src/contracts/definition";
import { DEFINITION_RESPONSE_LIMIT_BYTES } from "../../src/contracts/definition";
import type {
  RuntimeRequest,
  RuntimeResponse,
} from "../../src/contracts/messages";
import { expect, test } from "./fixtures";

const expectedOrigins = [...WIKTIONARY_HOSTS];

async function waitForPageIntegration(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (
        globalThis as typeof globalThis & {
          [key: symbol]: { ready?: boolean } | undefined;
        }
      )[Symbol.for("slava.pageIntegration")]?.ready === true,
  );
}

async function sendRuntime(
  page: Page,
  request: RuntimeRequest,
): Promise<RuntimeResponse> {
  return page.evaluate(async (runtimeRequest): Promise<RuntimeResponse> => {
    const extensionGlobal = globalThis as unknown as {
      chrome: {
        runtime: {
          sendMessage(
            message: RuntimeRequest,
            callback: (response: RuntimeResponse) => void,
          ): void;
        };
      };
    };
    return new Promise((resolve) => {
      extensionGlobal.chrome.runtime.sendMessage(runtimeRequest, resolve);
    });
  }, request);
}

test("loads the MV3 extension with exact Wiktionary host permissions", async ({
  extensionId,
}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  const manifest = JSON.parse(
    await readFile(path.resolve(".output/chrome-mv3/manifest.json"), "utf8"),
  ) as { manifest_version: number; host_permissions?: string[] };

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.host_permissions?.sort()).toEqual(expectedOrigins.sort());
});

test("packaged smoke loads executable code and local data", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("body")).toContainText("Slava Russian Dictionary");
  const result = await page.evaluate(async () => {
    const extensionGlobal = globalThis as unknown as {
      chrome: {
        runtime: {
          sendMessage(message: unknown): Promise<unknown>;
        };
      };
    };
    return extensionGlobal.chrome.runtime.sendMessage({
      kind: "local.lookup",
      requestId: "packaged-smoke",
      token: "иноагентов",
    });
  });
  expect(result).toMatchObject({
    kind: "local.result",
    morphology: {
      candidates: expect.arrayContaining([
        expect.objectContaining({ lemma: "иноагент" }),
      ]),
    },
    stress: {
      candidates: [
        {
          source: "kaikki-en-2026-09-28",
          stressed: "иноаге́нтов",
        },
      ],
      status: "resolved",
    },
  });
});

test("restarts its service worker without changing extension identity", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const versionUpdate = new Promise<{
    versions: Array<{ scriptURL: string; versionId: string }>;
  }>((resolve) => {
    cdp.once("ServiceWorker.workerVersionUpdated", resolve);
  });
  await cdp.send("ServiceWorker.enable");
  const version = (await versionUpdate).versions.find(
    ({ scriptURL }) => scriptURL === serviceWorker.url(),
  );
  expect(version).toBeDefined();
  await cdp.send("ServiceWorker.stopWorker", {
    versionId: version?.versionId ?? "",
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("body")).toContainText("Slava Russian Dictionary");
  await expect
    .poll(() => context.serviceWorkers().length)
    .toBeGreaterThanOrEqual(1);
  expect(new URL(context.serviceWorkers()[0]?.url() ?? "").hostname).toBe(
    extensionId,
  );
});

test("persists settings and exports sanitized local diagnostics", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator("body")).toContainText(
    "Stress and morphology work offline from verified packaged indexes",
  );
  await expect(page.locator("body")).toContainText(
    "Slava tries the selected languages in this order",
  );
  await expect(page.locator("#diagnostics")).toContainText("Morphology index");
  await expect(page.locator("#edition-list input")).toHaveCount(21);
  await expect(page.locator('#interface-locale option[value="fr"]')).toHaveText(
    "Français",
  );
  await expect(page.locator('#interface-locale option[value="de"]')).toHaveText(
    "Deutsch",
  );
  await expect(page.locator("#interface-locale option")).toHaveCount(22);
  await expect(page.locator('#interface-locale option[value="he"]')).toHaveText(
    "עברית",
  );
  await expect(
    page.locator('#edition-list li[data-edition="fr"] label'),
  ).toContainText("Français");
  await expect(
    page.locator('#edition-list li[data-edition="de"] label'),
  ).toContainText("Deutsch");
  await expect(
    page.locator('#edition-list li[data-edition="ar"] label'),
  ).toContainText("العربية");
  await expect(
    page.locator('#edition-list li[data-edition="ar"] label span'),
  ).toHaveAttribute("dir", "auto");
  await expect(
    page.locator('#edition-list li[data-edition="ar"] label span'),
  ).toHaveAttribute("lang", "ar");
  const additionalAutonyms: Partial<Record<DefinitionEdition, string>> = {
    he: "עברית",
    pl: "Polski",
    ro: "Română",
    tr: "Türkçe",
    it: "Italiano",
    kk: "Қазақша",
    lv: "Latviešu",
    et: "Eesti",
    lt: "Lietuvių",
  };
  for (const [edition, autonym] of Object.entries(additionalAutonyms)) {
    await expect(
      page.locator(`#edition-list li[data-edition="${edition}"] label`),
    ).toContainText(autonym ?? "");
  }
  await page.locator("#interface-locale").selectOption("he");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#settings-status")).toHaveText("ההגדרות נשמרו.");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("#settings-status")).toHaveText("Settings saved.");
  await page.locator('#edition-list input[value="fr"]').check();
  await expect(page.locator("#settings-status")).toHaveText("Settings saved.");
  await page
    .locator('#edition-list li[data-edition="fr"]')
    .getByRole("button", { name: "Move up" })
    .click();
  await expect(page.locator("#settings-status")).toHaveText("Settings saved.");
  await page.locator("#interface-locale").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("#settings-status")).toHaveText(
    "Paramètres enregistrés.",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Paramètres de Slava",
  );
  await expect(page.locator('#interface-locale option[value="de"]')).toHaveText(
    "Deutsch",
  );
  await expect(
    page.locator('#edition-list li[data-edition="de"] label'),
  ).toContainText("Deutsch");
  await page.locator("#stress-marks").uncheck();
  await page.locator("#definition-popups").uncheck();
  await expect(page.locator("#settings-status")).toHaveText(
    "Paramètres enregistrés.",
  );
  await page.reload();
  await expect(
    page
      .locator("#edition-list input:checked")
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      ),
  ).resolves.toEqual(["fr", "en"]);
  await expect(page.locator("#interface-locale")).toHaveValue("fr");
  await expect(page.locator("#stress-marks")).not.toBeChecked();
  await expect(page.locator("#definition-popups")).not.toBeChecked();
  await page.locator("#high-contrast").check();
  await page.locator("#font-scale").selectOption("large");
  await page.locator("#diagnostics-enabled").check();
  await expect(page.locator("#settings-status")).toHaveText(
    "Paramètres enregistrés.",
  );
  await expect(page.getByRole("button", { name: "Save settings" })).toHaveCount(
    0,
  );

  await page.reload();
  await expect(page.locator('#edition-list input[value="fr"]')).toBeChecked();
  await expect(page.locator("#high-contrast")).toBeChecked();
  await expect(page.locator("#font-scale")).toHaveValue("large");
  await expect(page.locator("#diagnostics")).toContainText(
    "https://en.wiktionary.org",
  );
  await expect(page.locator("#diagnostics")).toContainText("Stress index");
  await expect(page.locator("#diagnostics")).toContainText("Lookup cache");

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter les diagnostics épurés" })
    .click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadedPath ?? "", "utf8")) as {
    settings: Record<string, unknown>;
    diagnostics: Record<string, unknown>;
  };
  expect(exported.settings).toMatchObject({
    definitionEditions: ["fr", "en"],
    interfaceLocale: "fr",
    diagnosticsEnabled: true,
  });
  expect(exported.settings).not.toHaveProperty("persistentOrigins");
  expect(JSON.stringify(exported)).not.toContain("pageUrl");
  expect(JSON.stringify(exported)).not.toContain("definitions");
  expect(exported.diagnostics).toHaveProperty("wiktionaryHosts");
  await page.locator("#interface-locale").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator('#edition-list input[value="fr"]')).toBeChecked();
});

test("applies stress and definition preferences independently", async ({
  context,
  extensionId,
}) => {
  const fixture = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/en/говорить.json"),
      "utf8",
    ),
  ) as { response: unknown };
  await context.route(
    /^https:\/\/en\.wiktionary\.org\/w\/api\.php/,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "api-user-agent",
            "access-control-allow-methods": "GET",
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(fixture.response),
      });
    },
  );

  async function setFeatures(
    stressMarks: boolean,
    definitionPopups: boolean,
  ): Promise<void> {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(options.locator("#diagnostics")).toContainText(
      "Morphology index",
    );
    await options.locator("#stress-marks").setChecked(stressMarks);
    await options.locator("#definition-popups").setChecked(definitionPopups);
    await expect(options.locator("#settings-status")).toHaveText(
      "Settings saved.",
    );
    await options.close();
  }

  async function loadAnnotatedPage() {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
    await page.evaluate(async () => {
      document.body.innerHTML = "<p id='lookup'>Он говорил.</p>";
      const script = document.createElement("script");
      script.src = "/page-integration.js";
      await new Promise<void>((resolve, reject) => {
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener(
          "error",
          () => reject(new Error("load failed")),
          { once: true },
        );
        document.head.append(script);
      });
    });
    await waitForPageIntegration(page);
    return page;
  }

  await setFeatures(false, true);
  const definitionOnly = await loadAnnotatedPage();
  const plainInteractiveToken = definitionOnly.locator(
    "[data-slava-token][data-slava-original='говорил']",
  );
  await expect(plainInteractiveToken).toHaveText("говорил");
  await plainInteractiveToken.hover();
  await expect(
    definitionOnly.locator("[data-slava-root] .dialog"),
  ).toContainText("говорить");
  await definitionOnly.close();

  await setFeatures(true, false);
  const stressOnly = await loadAnnotatedPage();
  const stressedToken = stressOnly.locator(
    "[data-slava-token][data-slava-original='говорил']",
  );
  await expect(stressedToken).toHaveText("говори́л");
  await stressedToken.hover();
  await stressOnly.waitForTimeout(500);
  await expect(stressOnly.locator("[data-slava-root]")).toHaveCount(0);
  await stressOnly.close();

  await setFeatures(false, false);
  const disabled = await loadAnnotatedPage();
  await expect(disabled.locator("#lookup")).toHaveText("Он говорил.");
  await expect(disabled.locator("[data-slava-token]")).toHaveCount(0);
  await disabled.close();
});

test("exposes explicit current-tab controls in the popup", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(
    page.getByRole("button", { name: "Enable temporarily on this site" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Always enable on this site" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disable on this tab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settings and diagnostics" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "Temporary access follows links on the same origin",
  );

  const settings = await sendRuntime(page, {
    kind: "settings.get",
    requestId: crypto.randomUUID(),
  });
  if (settings.kind !== "settings.result") {
    throw new Error("Settings unavailable");
  }
  await sendRuntime(page, {
    kind: "settings.update",
    requestId: crypto.randomUUID(),
    settings: { ...settings.settings, interfaceLocale: "fr" },
  });
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Activer temporairement sur ce site",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Toujours activer sur ce site",
    }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("supports verified local range reads and bounded lookup latency", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const workerLogs: string[] = [];
  serviceWorker.on("console", (message) => {
    workerLogs.push(message.text());
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  const range = await page.evaluate(async () => {
    const response = await fetch("/indexes/morphology/exception-postings.bin", {
      headers: { Range: "bytes=0-63" },
    });
    return {
      bytes: (await response.arrayBuffer()).byteLength,
      contentRange: response.headers.get("content-range"),
      status: response.status,
    };
  });
  expect(range).toEqual({
    bytes: 64,
    contentRange: null,
    status: 200,
  });

  const send = (request: RuntimeRequest) =>
    page.evaluate(async (runtimeRequest): Promise<RuntimeResponse> => {
      const extensionGlobal = globalThis as unknown as {
        chrome: {
          runtime: {
            sendMessage(
              message: RuntimeRequest,
              callback: (response: RuntimeResponse) => void,
            ): void;
          };
        };
      };
      return new Promise((resolve) => {
        extensionGlobal.chrome.runtime.sendMessage(runtimeRequest, resolve);
      });
    }, request);

  const coldTokens = [
    "говорил",
    "говорю",
    "говоришь",
    "говорит",
    "говорим",
    "говорите",
    "говорят",
    "говорила",
    "говорили",
    "сказать",
    "сказал",
    "слово",
    "слова",
    "человек",
    "люди",
    "книга",
    "книги",
    "читать",
    "пишет",
    "написать",
  ];
  const coldDurations: number[] = [];
  let firstCold: RuntimeResponse | undefined;
  for (const [index, token] of coldTokens.entries()) {
    const started = performance.now();
    const response = await send({
      kind: "local.lookup",
      requestId: `cold-${index}`,
      token,
    });
    coldDurations.push(performance.now() - started);
    firstCold ??= response;
  }
  expect(firstCold, workerLogs.join("\n")).toMatchObject({
    kind: "local.result",
    morphology: {
      candidates: expect.arrayContaining([
        expect.objectContaining({ lemma: "говорить" }),
      ]),
    },
  });
  coldDurations.sort((left, right) => left - right);
  const coldP95Index = Math.ceil(coldDurations.length * 0.95) - 1;
  expect(coldDurations[coldP95Index]).toBeLessThanOrEqual(150);

  const warmDurations: number[] = [];
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    await send({
      kind: "local.lookup",
      requestId: `warm-${index}`,
      token: "говорил",
    });
    warmDurations.push(performance.now() - started);
  }
  warmDurations.sort((left, right) => left - right);
  const warmP95Index = Math.ceil(warmDurations.length * 0.95) - 1;
  expect(warmDurations[warmP95Index]).toBeLessThanOrEqual(50);
  expect(
    await send({ kind: "local.diagnostics", requestId: "diagnostics" }),
  ).toMatchObject({
    kind: "local.diagnostics-result",
    cacheEntries: coldTokens.length,
    cacheHits: 20,
    cacheMisses: coldTokens.length,
  });
});

test("parses captured Wiktionary HTML in the detached parser page", async ({
  extensionId,
  serviceWorker,
}) => {
  const parseInOffscreen = (
    edition: DefinitionEdition,
    html: string,
    requestId: string,
  ) =>
    serviceWorker.evaluate(
      async ({ edition, extensionId, html, requestId }) => {
        const extensionGlobal = globalThis as unknown as {
          chrome: {
            offscreen: {
              closeDocument(): Promise<void>;
              createDocument(options: {
                url: string;
                reasons: ["DOM_PARSER"];
                justification: string;
              }): Promise<void>;
              hasDocument(): Promise<boolean>;
            };
            runtime: {
              sendMessage(message: unknown): Promise<unknown>;
            };
          };
        };
        if (!(await extensionGlobal.chrome.offscreen.hasDocument())) {
          await extensionGlobal.chrome.offscreen.createDocument({
            url: `chrome-extension://${extensionId}/offscreen.html`,
            reasons: ["DOM_PARSER"],
            justification: "Verify captured Wiktionary parser fixtures",
          });
        }
        return extensionGlobal.chrome.runtime.sendMessage({
          kind: "offscreen.parse-definition",
          requestId,
          edition,
          html,
        });
      },
      { edition, extensionId, html, requestId },
    );

  const usableTitles: Record<DefinitionEdition, string> = {
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
  for (const edition of Object.keys(usableTitles) as DefinitionEdition[]) {
    const title = usableTitles[edition];
    const fixture = JSON.parse(
      await readFile(
        path.resolve(`tests/fixtures/mediawiki/${edition}/${title}.json`),
        "utf8",
      ),
    ) as { response: { parse: { text: string } } };
    const result = await parseInOffscreen(
      edition,
      fixture.response.parse.text,
      `parser-${edition}`,
    );
    expect(result).toMatchObject({
      kind: "offscreen.parse-result",
      requestId: `parser-${edition}`,
      result: {
        kind: "success",
      },
    });
    const parsed = result as {
      result: { entries: Array<{ senses: string[] }> };
    };
    expect(parsed.result.entries.length).toBeGreaterThan(0);
    expect(parsed.result.entries[0]?.senses.length).toBeGreaterThan(0);
  }

  const frenchDriver = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/fr/драйвер.json"),
      "utf8",
    ),
  ) as { response: { parse: { text: string } } };
  const frenchDriverResult = await parseInOffscreen(
    "fr",
    frenchDriver.response.parse.text,
    "parser-fr-numbered-part-of-speech",
  );
  expect(frenchDriverResult).toMatchObject({
    kind: "offscreen.parse-result",
    result: {
      kind: "success",
      entries: expect.arrayContaining([
        {
          partOfSpeech: "Nom commun",
          senses: expect.arrayContaining([expect.any(String)]),
        },
      ]),
    },
  });

  const englishPredicative = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/en/должен.json"),
      "utf8",
    ),
  ) as { response: { parse: { text: string } } };
  const englishPredicativeResult = await parseInOffscreen(
    "en",
    englishPredicative.response.parse.text,
    "parser-en-predicative",
  );
  expect(englishPredicativeResult).toMatchObject({
    kind: "offscreen.parse-result",
    result: {
      kind: "success",
      entries: expect.arrayContaining([
        {
          partOfSpeech: "Predicative",
          senses: expect.arrayContaining([expect.any(String)]),
        },
      ]),
    },
  });

  const chinesePreposition = JSON.parse(
    await readFile(path.resolve("tests/fixtures/mediawiki/zh/с.json"), "utf8"),
  ) as { response: { parse: { text: string } } };
  const chinesePrepositionResult = await parseInOffscreen(
    "zh",
    chinesePreposition.response.parse.text,
    "parser-zh-preposition",
  );
  expect(chinesePrepositionResult).toMatchObject({
    kind: "offscreen.parse-result",
    result: {
      kind: "success",
      entries: expect.arrayContaining([
        {
          partOfSpeech: "介詞",
          senses: expect.arrayContaining([expect.any(String)]),
        },
        {
          partOfSpeech: "前綴",
          senses: expect.arrayContaining([expect.any(String)]),
        },
      ]),
    },
  });

  const hostile = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/synthetic/hostile.json"),
      "utf8",
    ),
  ) as { response: { parse: { text: string } } };
  await expect(
    parseInOffscreen("en", hostile.response.parse.text, "hostile"),
  ).resolves.toMatchObject({
    result: {
      kind: "success",
      entries: [{ senses: ["to speak"] }],
    },
  });

  const generatedHostile = await parseInOffscreen(
    "en",
    [
      '<h2 id="Russian">Russian</h2>',
      '<h3 id="Verb">Verb</h3>',
      '<ol><li onclick="compromised()">to speak ',
      '<a href="javascript:compromised()">linked phrase</a>',
      "<style>.secret{display:block}</style>",
      "<script>globalThis.compromised=true</script>",
      '<img src="x" onerror="compromised()">',
      "<audio>media secret</audio><video>video secret</video>",
      "<form><input value='private'><button>form secret</button></form>",
      "<ul><li><ol><li>deep example secret</li></ol></li></ul>",
      "</li></ol>",
    ].join(""),
    "generated-hostile",
  );
  expect(generatedHostile).toMatchObject({
    result: {
      kind: "success",
      entries: [{ senses: ["to speak linked phrase"] }],
    },
  });
  expect(JSON.stringify(generatedHostile)).not.toMatch(
    /compromised|secret|javascript:|private/u,
  );

  await expect(
    parseInOffscreen(
      "en",
      [
        '<h2 id="Russian">Russian</h2>',
        '<h3 id="Participle">Participle</h3>',
        "<ol><li>past active participle of пропа́сть</li></ol>",
        '<h4 id="Declension">Declension</h4>',
      ].join(""),
      "participle",
    ),
  ).resolves.toMatchObject({
    result: {
      kind: "success",
      entries: [
        {
          partOfSpeech: "Participle",
          senses: ["past active participle of пропа́сть"],
        },
      ],
    },
  });

  const unrelated = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/synthetic/no-russian-entry.json"),
      "utf8",
    ),
  ) as { response: { parse: { text: string } } };
  await expect(
    parseInOffscreen("en", unrelated.response.parse.text, "unrelated"),
  ).resolves.toMatchObject({
    result: { kind: "no-russian-entry" },
  });
  await serviceWorker.evaluate(async () => {
    const extensionGlobal = globalThis as unknown as {
      chrome: {
        offscreen: {
          closeDocument(): Promise<void>;
          hasDocument(): Promise<boolean>;
        };
      };
    };
    if (await extensionGlobal.chrome.offscreen.hasDocument()) {
      await extensionGlobal.chrome.offscreen.closeDocument();
    }
  });
});

test("annotates page text reversibly and excludes sensitive surfaces", async ({
  context,
  extensionId,
}) => {
  const observedPages: string[] = [];
  const fixture = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/en/говорить.json"),
      "utf8",
    ),
  ) as { response: unknown };
  await context.route(
    /^https:\/\/en\.wiktionary\.org\/w\/api\.php/,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "api-user-agent",
            "access-control-allow-methods": "GET",
          },
        });
        return;
      }
      observedPages.push(
        new URL(route.request().url()).searchParams.get("page") ?? "",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(fixture.response),
      });
    },
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(async () => {
    document.body.innerHTML = `
      <main>
        <p id="ordinary" style="font-family: Georgia, serif; font-style: italic; font-kerning: none; letter-spacing: .2em">В 2022 году он говорил громко около полок и спросил как от, что бы сказать по поводу нефтепродукты твердого и подвел. Углубленное исследование отдано редактору. Сильнее сильнее.</p>
        <p id="wrapping" style="width: 4em">балтийского</p>
        <a id="link" href="https://example.com/">Он говорил.</a>
        <p id="selected">Он говорил тихо.</p>
        <pre id="pre">Он говорил.</pre>
        <input id="input" value="Он говорил.">
        <div id="editable" contenteditable="true">Он говорил.</div>
        <div id="hidden" hidden>Он говорил.</div>
        <div id="dynamic"></div>
      </main>
    `;
    const selected = document.querySelector("#selected")?.firstChild;
    if (selected !== null && selected !== undefined) {
      const range = document.createRange();
      range.selectNodeContents(selected);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    const script = document.createElement("script");
    script.src = "/page-integration.js";
    await new Promise<void>((resolve, reject) => {
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("load failed")), {
        once: true,
      });
      document.head.append(script);
    });
  });

  await expect
    .poll(() => page.locator("#ordinary [data-slava-token]").count())
    .toBeGreaterThan(0);
  const yoInflectionLookup = await sendRuntime(page, {
    kind: "local.lookup",
    requestId: crypto.randomUUID(),
    token: "подвел",
  });
  expect(yoInflectionLookup).toMatchObject({
    kind: "local.result",
    stress: {
      candidates: [{ stressed: "подвёл" }],
      status: "resolved",
    },
  });
  await expect(page.locator("#ordinary")).toContainText("говори́л");
  await expect(page.locator("#ordinary")).toContainText("го́ду́");
  await expect(page.locator("#ordinary")).toContainText("по́ло́к");
  await expect(page.locator("#ordinary")).toContainText(
    "по по́воду́ нефтепроду́кты твёрдого и подвёл.",
  );
  await expect(page.locator("#ordinary")).toContainText(
    "Углублённое иссле́дование",
  );
  await expect(
    page.locator("#ordinary [data-slava-token][data-slava-original='отдано']"),
  ).toHaveText("о́тдано");
  await expect(page.locator("#ordinary")).toContainText("Сильне́е сильне́е.");
  await expect(page.locator("#ordinary")).not.toContainText("ка́к");
  await expect(page.locator("#ordinary")).not.toContainText("бы́");
  const wrappingToken = page.locator(
    "#wrapping [data-slava-token][data-slava-original='балтийского']",
  );
  await expect(wrappingToken).toHaveCSS("white-space", "nowrap");
  await expect(wrappingToken).toHaveText("балти́йского");
  expect(
    await wrappingToken.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top)),
      ).size;
    }),
  ).toBe(1);
  const stressedGrapheme = page
    .locator("#ordinary [data-slava-stressed-grapheme]")
    .first();
  await expect(stressedGrapheme).toHaveCSS("display", "inline-block");
  await expect(stressedGrapheme).toHaveCSS("letter-spacing", "normal");
  await expect(stressedGrapheme).toHaveAttribute(
    "data-slava-positioned-stress",
    "",
  );
  await expect(stressedGrapheme).toHaveText("о́");
  expect(
    await stressedGrapheme.evaluate((element) => ({
      priority: (element as HTMLElement).style.getPropertyPriority(
        "letter-spacing",
      ),
      value: (element as HTMLElement).style.getPropertyValue("letter-spacing"),
    })),
  ).toEqual({ priority: "important", value: "0px" });
  const accentGeometry = await stressedGrapheme.evaluate((element) => {
    const copyMark = element.querySelector("[data-slava-stress-copy-mark]");
    if (!(copyMark instanceof HTMLElement)) {
      throw new Error("Stress geometry is incomplete");
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    const style = getComputedStyle(element);
    const [markWidth = Infinity, markHeight = Infinity] = style.backgroundSize
      .split(" ")
      .map((value) => Number.parseFloat(value));
    const fontSize = Number.parseFloat(style.fontSize);
    return {
      backgroundImage: style.backgroundImage,
      backgroundPositionX: style.backgroundPositionX,
      copiedText: range.toString(),
      copyMarkOpacity: getComputedStyle(copyMark).opacity,
      markHeightRatio: markHeight / fontSize,
      markWidthRatio: markWidth / fontSize,
    };
  });
  expect(accentGeometry.backgroundImage).toContain("115deg");
  expect(accentGeometry.backgroundPositionX).toBe("50%");
  expect(accentGeometry.markHeightRatio).toBeLessThanOrEqual(0.25);
  expect(accentGeometry.markWidthRatio).toBeLessThanOrEqual(0.23);
  expect(accentGeometry.copiedText).toBe("о́");
  expect(accentGeometry.copyMarkOpacity).toBe("0");
  await expect(
    page.locator("#ordinary [data-slava-token][data-slava-original='от']"),
  ).toHaveText("от");
  await page
    .locator("#ordinary [data-slava-token][data-slava-original='от']")
    .hover();
  await expect(
    page
      .locator("[data-slava-root] .dialog")
      .getByRole("heading", { level: 2 }),
  ).toHaveText("от");
  await expect.poll(() => observedPages).toContain("от");
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);
  await expect(page.locator("#link")).toHaveAttribute(
    "href",
    "https://example.com/",
  );
  await expect(page.locator("#link")).toContainText("говори́л");
  await expect(page.locator("#selected [data-slava-token]")).toHaveCount(0);
  await expect(page.locator("#pre [data-slava-token]")).toHaveCount(0);
  await expect(page.locator("#editable [data-slava-token]")).toHaveCount(0);
  await expect(page.locator("#hidden [data-slava-token]")).toHaveCount(0);
  await expect(page.locator("#input")).toHaveValue("Он говорил.");

  await page.locator("#dynamic").evaluate((element) => {
    element.textContent = "Он говорил снова.";
  });
  await expect
    .poll(() => page.locator("#dynamic [data-slava-token]").count())
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        [key: symbol]: { deactivate(): void } | undefined;
      }
    )[Symbol.for("slava.pageIntegration")];
    state?.deactivate();
  });
  await expect(page.locator("[data-slava-token]")).toHaveCount(0);
  await expect(page.locator("#ordinary")).toHaveText(
    "В 2022 году он говорил громко около полок и спросил как от, что бы сказать по поводу нефтепродукты твердого и подвел. Углубленное исследование отдано редактору. Сильнее сильнее.",
  );
  await expect(page.locator("#wrapping")).toHaveText("балтийского");
  await expect(page.locator("#dynamic")).toHaveText("Он говорил снова.");
});

test("activates a 100,000-character page within latency and heap budgets", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(180_000);
  const releasePolicy = JSON.parse(
    await readFile("data/config/release-policy.json", "utf8"),
  ) as {
    budgets: {
      activationHeapDeltaBytes: number;
      activationRendererWorkP95Milliseconds: number;
    };
  };
  const { activationHeapDeltaBytes, activationRendererWorkP95Milliseconds } =
    releasePolicy.budgets;
  const attemptsPerSample = 3;
  const activeSamples: number[] = [];
  const activeAttemptSamples: number[][] = [];
  const wallClockSamples: number[] = [];
  const wallClockAttemptSamples: number[][] = [];
  const heapDeltaSamples: number[] = [];
  const activate = (page: Page) =>
    page.evaluate(async () => {
      const start = performance.now();
      const completionTimeoutMilliseconds = 5_000;
      const script = document.createElement("script");
      script.src = "/page-integration.js";
      await new Promise<void>((resolve, reject) => {
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener(
          "error",
          () => reject(new Error("load failed")),
          {
            once: true,
          },
        );
        document.head.append(script);
      });
      await new Promise<void>((resolve, reject) => {
        const checkCompletion = () => {
          const state = (
            globalThis as typeof globalThis & {
              [key: symbol]: { ready: boolean } | undefined;
            }
          )[Symbol.for("slava.pageIntegration")];
          if (
            state?.ready === true &&
            document.querySelector("[data-slava-token]") !== null
          ) {
            resolve();
            return;
          }
          if (performance.now() - start >= completionTimeoutMilliseconds) {
            reject(new Error("activation did not complete within 5 seconds"));
            return;
          }
          setTimeout(checkCompletion, 25);
        };
        checkCompletion();
      });
      return performance.now() - start;
    });
  const deactivate = (page: Page) =>
    page.evaluate(() => {
      const state = (
        globalThis as typeof globalThis & {
          [key: symbol]: { deactivate(): void } | undefined;
        }
      )[Symbol.for("slava.pageIntegration")];
      state?.deactivate();
    });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const heap = async () => {
    const response = await cdp.send("Performance.getMetrics");
    return (
      response.metrics.find((metric) => metric.name === "JSHeapUsedSize")
        ?.value ?? 0
    );
  };
  const activeDuration = async () => {
    const response = await cdp.send("Performance.getMetrics");
    return response.metrics
      .filter((metric) =>
        ["ScriptDuration", "LayoutDuration", "RecalcStyleDuration"].includes(
          metric.name,
        ),
      )
      .reduce((total, metric) => total + metric.value, 0);
  };
  await page.evaluate(() => {
    const phrase = "Он говорил громко. ";
    document.body.textContent = phrase
      .repeat(Math.ceil(100_000 / phrase.length))
      .slice(0, 100_000);
  });
  const warmupMilliseconds = await activate(page);
  await deactivate(page);
  for (let sample = 0; sample < 20; sample++) {
    const activeAttempts: number[] = [];
    const wallClockAttempts: number[] = [];
    const heapDeltas: number[] = [];
    for (let attempt = 0; attempt < attemptsPerSample; attempt++) {
      await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
      await page.evaluate(() => {
        const phrase = "Он говорил громко. ";
        document.body.textContent = phrase
          .repeat(Math.ceil(100_000 / phrase.length))
          .slice(0, 100_000);
      });
      await cdp.send("HeapProfiler.collectGarbage");
      const baselineHeap = await heap();
      const baselineActiveDuration = await activeDuration();
      wallClockAttempts.push(await activate(page));
      const activeHeap = await heap();
      activeAttempts.push(
        ((await activeDuration()) - baselineActiveDuration) * 1_000,
      );
      heapDeltas.push(activeHeap - baselineHeap);
    }
    activeAttempts.sort((left, right) => left - right);
    wallClockAttempts.sort((left, right) => left - right);
    heapDeltas.sort((left, right) => left - right);
    activeAttemptSamples.push(activeAttempts);
    wallClockAttemptSamples.push(wallClockAttempts);
    activeSamples.push(
      activeAttempts[Math.floor(activeAttempts.length / 2)] ?? Infinity,
    );
    wallClockSamples.push(
      wallClockAttempts[Math.floor(wallClockAttempts.length / 2)] ?? Infinity,
    );
    heapDeltaSamples.push(
      heapDeltas[Math.floor(heapDeltas.length / 2)] ?? Infinity,
    );
  }
  await page.close();
  activeSamples.sort((left, right) => left - right);
  wallClockSamples.sort((left, right) => left - right);
  const p95 =
    activeSamples[Math.ceil(activeSamples.length * 0.95) - 1] ?? Infinity;
  const wallClockMedian =
    wallClockSamples[Math.floor(wallClockSamples.length / 2)] ?? Infinity;
  const wallClockP95 =
    wallClockSamples[Math.ceil(wallClockSamples.length * 0.95) - 1] ?? Infinity;
  const maximumHeapDelta = Math.max(...heapDeltaSamples);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/activation-performance.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        fixtureCharacters: 100_000,
        measurement:
          "p95 of median-of-three steady-state renderer work after warmup",
        enforcedBudgets: {
          rendererWorkP95Milliseconds: activationRendererWorkP95Milliseconds,
          heapDeltaBytes: activationHeapDeltaBytes,
        },
        wallClockMeasurement:
          "diagnostic only because shared-runner scheduling is external to extension work",
        sampleCount: activeSamples.length,
        attemptsPerSample,
        p95Milliseconds: p95,
        wallClockMedianMilliseconds: wallClockMedian,
        wallClockP95Milliseconds: wallClockP95,
        maximumHeapDeltaBytes: maximumHeapDelta,
        samplesMilliseconds: activeSamples,
        attemptSamplesMilliseconds: activeAttemptSamples,
        wallClockSamplesMilliseconds: wallClockSamples,
        wallClockAttemptSamplesMilliseconds: wallClockAttemptSamples,
        heapDeltaSamplesBytes: heapDeltaSamples,
        warmupMilliseconds,
      },
      null,
      2,
    )}\n`,
  );
  expect(p95).toBeLessThanOrEqual(activationRendererWorkP95Milliseconds);
  expect(maximumHeapDelta).toBeLessThanOrEqual(activationHeapDeltaBytes);
});

test("opens lexical definitions from trusted hover, pointer, or keyboard actions", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(60_000);
  const observedRequests: Array<{
    method: string;
    url: string;
    cookie: string | undefined;
  }> = [];
  let activeGets = 0;
  let maximumConcurrentGets = 0;
  let releaseAlternativePair: () => void = () => undefined;
  const alternativePairReady = new Promise<void>((resolve) => {
    releaseAlternativePair = resolve;
  });
  let releaseProgressiveDefinition: () => void = () => undefined;
  const progressiveDefinitionReady = new Promise<void>((resolve) => {
    releaseProgressiveDefinition = resolve;
  });
  const fixture = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/en/говорить.json"),
      "utf8",
    ),
  ) as { response: unknown };
  await context.route(
    /^https:\/\/en\.wiktionary\.org\/w\/api\.php/,
    async (route) => {
      observedRequests.push({
        method: route.request().method(),
        url: route.request().url(),
        cookie: route.request().headers().cookie,
      });
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "api-user-agent",
            "access-control-allow-methods": "GET",
          },
        });
        return;
      }
      activeGets += 1;
      maximumConcurrentGets = Math.max(maximumConcurrentGets, activeGets);
      try {
        const requestedPage = new URL(route.request().url()).searchParams.get(
          "page",
        );
        if (["сел", "сесть", "сёл"].includes(requestedPage ?? "")) {
          if (activeGets === 2) {
            releaseAlternativePair();
          }
          await alternativePairReady;
        }
        if (requestedPage === "измениться") {
          await progressiveDefinitionReady;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(fixture.response),
        });
      } finally {
        activeGets -= 1;
      }
    },
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(async () => {
    document.body.innerHTML = "<p id='lookup'>Он говорил.</p>";
    const script = document.createElement("script");
    script.src = "/page-integration.js";
    await new Promise<void>((resolve, reject) => {
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("load failed")), {
        once: true,
      });
      document.head.append(script);
    });
  });
  const token = page.locator("#lookup [data-slava-token]").filter({
    hasText: "говори́л",
  });
  await expect(token).toHaveCount(1);

  const lookupBox = await page.locator("#lookup").boundingBox();
  if (lookupBox === null) {
    throw new Error("Lookup fixture is not visible");
  }
  const selectionY = lookupBox.y + lookupBox.height / 2;
  await page.mouse.move(lookupBox.x + 2, selectionY);
  await page.mouse.down();
  await page.mouse.move(lookupBox.x + lookupBox.width / 2, selectionY, {
    steps: 10,
  });
  await page.waitForTimeout(150);
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);
  await page.mouse.move(lookupBox.x + lookupBox.width - 2, selectionY, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.isCollapsed))
    .toBe(false);
  await token.click();
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.isCollapsed))
    .toBe(true);
  await page.mouse.move(0, 0);

  await token.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  });
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        altKey: true,
        bubbles: true,
        key: "d",
        shiftKey: true,
      }),
    );
  });
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);
  await page.waitForTimeout(150);
  expect(
    observedRequests.filter(({ method }) => method === "GET"),
  ).toHaveLength(0);

  await token.hover();
  const hoverCard = page.locator("[data-slava-root] .dialog");
  await expect(hoverCard.getByRole("heading", { level: 2 })).toHaveText(
    "говорил",
  );
  await expect(hoverCard).toContainText("говорить");
  await expect(hoverCard.locator("ol li").first()).not.toBeEmpty();
  await expect(page.locator("[data-slava-root]")).toHaveAttribute(
    "data-presentation",
    "hover",
  );
  const hoverGets = observedRequests.filter(({ method }) => method === "GET");
  expect(hoverGets.length).toBeGreaterThanOrEqual(1);
  expect(
    new Set(
      hoverGets.map(({ url }) => new URL(url).searchParams.get("page")),
    ).has("говорить"),
  ).toBe(true);
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);

  const beforeClick = observedRequests.filter(
    ({ method }) => method === "GET",
  ).length;
  await token.click();
  const dialog = page.locator("[data-slava-root] .dialog");
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("говорил");
  await expect(dialog).toContainText("говорить");
  await expect(dialog).not.toContainText("revision");
  await expect(dialog).not.toContainText("Wiktionary contributors");
  await expect(dialog.locator("ol li").first()).not.toBeEmpty();
  await expect(dialog.getByRole("link").first()).toHaveAttribute(
    "href",
    /^https:\/\/en\.wiktionary\.org\/wiki\//,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);

  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("читают");
  await page.getByRole("button", { name: "Look up" }).click();
  const lemmaHeadings = dialog.getByRole("heading", { level: 3 });
  await expect(lemmaHeadings).toHaveText(["читать"]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("угрозы");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(lemmaHeadings).toHaveText(["угроза"]);
  await expect(dialog).toContainText(
    "Nominative plural; Genitive singular; Accusative plural",
  );
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("изменилось");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByRole("heading", { level: 3 })).toHaveText(
    "измениться",
  );
  await expect(dialog).toContainText("Form: Neuter singular past indicative");
  await expect(dialog.getByRole("status")).toHaveText("Loading definitions…");
  await expect(dialog.locator("ol")).toHaveCount(0);
  releaseProgressiveDefinition();
  await expect(dialog.locator("ol li").first()).not.toBeEmpty();
  await expect(dialog).not.toContainText(
    "Neuter singular past; Neuter singular past indicative",
  );
  await page.keyboard.press("Escape");

  const beforeAspect = observedRequests.filter(
    ({ method }) => method === "GET",
  ).length;
  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("разбухать");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByRole("heading", { level: 3 })).toHaveText(
    "разбухать",
  );
  await expect(dialog).toContainText("Imperfective · Perfective: разбухнуть");
  await expect(
    dialog.getByRole("link", { name: "разбухнуть" }),
  ).toHaveAttribute(
    "href",
    "https://en.wiktionary.org/wiki/%D1%80%D0%B0%D0%B7%D0%B1%D1%83%D1%85%D0%BD%D1%83%D1%82%D1%8C",
  );
  const aspectPages = observedRequests
    .filter(({ method }) => method === "GET")
    .slice(beforeAspect)
    .map(({ url }) => new URL(url).searchParams.get("page"));
  expect(aspectPages).toContain("разбухать");
  expect(aspectPages).not.toContain("разбухнуть");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("сельские");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(dialog).toContainText(
    "Form: Nominative plural; Accusative inanimate plural",
  );
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("библиотеки");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(dialog).toContainText(
    "Form: Nominative plural; Genitive singular; Accusative plural",
  );
  await expect(dialog.getByText(/^Form:/)).toHaveCount(1);
  await page.keyboard.press("Escape");

  const beforeAlternative = observedRequests.filter(
    ({ method }) => method === "GET",
  ).length;
  maximumConcurrentGets = 0;
  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("сел");
  await page.getByRole("button", { name: "Look up" }).click();
  const alternativeHeadings = dialog.getByRole("heading", { level: 3 });
  await expect
    .poll(() => alternativeHeadings.allTextContents())
    .toEqual(["сёл", "сесть"]);
  const alternativePages = observedRequests
    .filter(({ method }) => method === "GET")
    .slice(beforeAlternative)
    .map(({ url }) => new URL(url).searchParams.get("page"));
  expect(alternativePages).toEqual(expect.arrayContaining(["сесть", "сёл"]));
  expect(maximumConcurrentGets).toBe(2);
  await page.keyboard.press("Escape");

  const beforeProperNoun = observedRequests.filter(
    ({ method }) => method === "GET",
  ).length;
  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("России");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByRole("heading", { level: 3 })).toHaveText([
    "Россия",
  ]);
  await expect
    .poll(() =>
      observedRequests
        .filter(({ method }) => method === "GET")
        .slice(beforeProperNoun)
        .map(({ url }) => new URL(url).searchParams.get("page")),
    )
    .toContain("Россия");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+Shift+d");
  await expect(page.getByLabel("Russian word")).toBeVisible();
  await page.getByLabel("Russian word").fill("говорил");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(dialog).toContainText("говорить");
  await expect(dialog).not.toContainText("revision");
  const gets = observedRequests.filter(({ method }) => method === "GET");
  expect(gets.length).toBeGreaterThan(beforeClick);
  for (const request of gets.slice(beforeClick)) {
    const url = new URL(request.url);
    expect(url.origin).toBe("https://en.wiktionary.org");
    expect(url.searchParams.get("page")).toMatch(
      /^[\p{Script=Cyrillic}\p{Mark}-]+$/u,
    );
    expect(url.href).not.toContain("Он");
    expect(request.cookie).toBeUndefined();
  }
  for (const request of observedRequests.filter(
    ({ method }) => method === "OPTIONS",
  )) {
    const url = new URL(request.url);
    expect(url.origin).toBe("https://en.wiktionary.org");
    expect(url.searchParams.get("page")).toMatch(
      /^[\p{Script=Cyrillic}\p{Mark}-]+$/u,
    );
    expect(request.cookie).toBeUndefined();
  }
  await page.keyboard.press("Escape");

  const settingsResponse = await sendRuntime(page, {
    kind: "settings.get",
    requestId: crypto.randomUUID(),
  });
  if (settingsResponse.kind !== "settings.result") {
    throw new Error("Settings unavailable");
  }
  await sendRuntime(page, {
    kind: "settings.update",
    requestId: crypto.randomUUID(),
    settings: { ...settingsResponse.settings, interfaceLocale: "fr" },
  });
  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Mot russe").fill("изменилось");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await expect(dialog).toContainText("Forme: Neutre singulier passé indicatif");
  await expect(page.locator("[data-slava-root]")).toHaveAttribute("dir", "ltr");
  await page.keyboard.press("Escape");

  await sendRuntime(page, {
    kind: "settings.update",
    requestId: crypto.randomUUID(),
    settings: { ...settingsResponse.settings, interfaceLocale: "ar" },
  });
  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("كلمة روسية").fill("говорить");
  await page.getByRole("button", { name: "بحث" }).click();
  await expect(page.locator("[data-slava-root]")).toHaveAttribute("dir", "rtl");
  const definitionList = page.locator("[data-slava-root] ol").first();
  await expect(definitionList).toHaveAttribute("dir", "auto");
  await expect
    .poll(() =>
      definitionList.evaluate((element) => getComputedStyle(element).direction),
    )
    .toBe("ltr");
});

test("renders bounded definition failures and English fallback", async ({
  context,
  extensionId,
}) => {
  type Scenario =
    | "offline"
    | "throttled"
    | "oversized"
    | "malformed"
    | "parser-drift"
    | "wrong-origin"
    | "fallback";
  let scenario: Scenario = "offline";
  const requests: Array<{ edition: string; method: string }> = [];
  const english = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/en/говорить.json"),
      "utf8",
    ),
  ) as { response: unknown };
  const missing = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/de/missing.json"),
      "utf8",
    ),
  ) as { response: unknown };

  await context.route(
    /^https:\/\/(en|fr|de)\.wiktionary\.org\/w\/api\.php/,
    async (route) => {
      const request = route.request();
      const edition = new URL(request.url()).hostname.slice(0, 2);
      requests.push({ edition, method: request.method() });
      if (request.method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "api-user-agent",
            "access-control-allow-methods": "GET",
          },
        });
        return;
      }
      if (scenario === "offline") {
        await route.abort("internetdisconnected");
        return;
      }
      if (scenario === "throttled") {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "retry-after": "11",
          },
          body: "{}",
        });
        return;
      }
      if (scenario === "oversized") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: "x".repeat(DEFINITION_RESPONSE_LIMIT_BYTES + 1),
        });
        return;
      }
      if (scenario === "malformed") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: "{",
        });
        return;
      }
      if (scenario === "parser-drift") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            parse: {
              title: "говорить",
              revid: 1,
              text: '<h2 id="Russian">Russian</h2><p>changed</p>',
            },
          }),
        });
        return;
      }
      if (scenario === "wrong-origin" && edition === "en") {
        const redirect = new URL(request.url());
        redirect.hostname = "fr.wiktionary.org";
        await route.fulfill({
          status: 302,
          headers: { location: redirect.href },
        });
        return;
      }
      if (scenario === "fallback" && edition === "de") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(missing.response),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(english.response),
      });
    },
  );

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(async () => {
    document.body.innerHTML =
      '<button id="return-focus">Reader control</button>';
    const script = document.createElement("script");
    script.src = "/page-integration.js";
    await new Promise<void>((resolve, reject) => {
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("load failed")), {
        once: true,
      });
      document.head.append(script);
    });
  });

  const setEditions = (editions: DefinitionEdition[]) =>
    page.evaluate(async (definitionEditions) => {
      const extensionGlobal = globalThis as unknown as {
        chrome: {
          runtime: {
            sendMessage(message: unknown): Promise<unknown>;
          };
        };
      };
      await extensionGlobal.chrome.runtime.sendMessage({
        kind: "settings.update",
        requestId: crypto.randomUUID(),
        settings: {
          schemaVersion: 1,
          definitionEditions,
          activationMode: "temporary",
          accessibility: {
            reducedMotion: true,
            highContrast: true,
            fontScale: "large",
          },
          diagnosticsEnabled: false,
          persistentOrigins: [],
        },
      });
    }, editions);
  const lookup = async (expected: string) => {
    await page.locator("#return-focus").focus();
    await page.keyboard.press("Alt+Shift+d");
    await page.getByLabel("Russian word").fill("говорить");
    await page.getByRole("button", { name: "Look up" }).click();
    const dialog = page.locator("[data-slava-root] .dialog");
    await expect(dialog).toContainText(expected, { timeout: 10_000 });
    await expect(page.locator("[data-slava-root]")).toHaveAttribute(
      "data-high-contrast",
      "true",
    );
    await expect(page.locator("[data-slava-root]")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    await expect(page.locator("[data-slava-root]")).toHaveAttribute(
      "data-font-scale",
      "large",
    );
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(() => {
        const root =
          document.querySelector<HTMLElement>("[data-slava-root]")?.shadowRoot;
        const close = root?.querySelector<HTMLButtonElement>(".close");
        close?.focus();
        return root?.activeElement?.getAttribute("aria-label") ?? null;
      }),
    ).toBe("Close definition");
    expect(
      await page.evaluate(() => {
        const root =
          document.querySelector<HTMLElement>("[data-slava-root]")?.shadowRoot;
        const sentinels =
          root?.querySelectorAll<HTMLElement>(".focus-sentinel");
        sentinels?.[1]?.focus();
        const after = root?.activeElement?.getAttribute("aria-label");
        return { after };
      }),
    ).toEqual({
      after: "Close definition",
    });
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slava-root]")).toHaveCount(0);
    await expect(page.locator("#return-focus")).toBeFocused();
  };

  await setEditions(["en"]);
  for (const [nextScenario, expected] of [
    ["offline", "unavailable while offline"],
    ["throttled", "Try again in 11 seconds"],
    ["oversized", "exceeded Slava's safety limit"],
    ["malformed", "invalid response"],
    ["parser-drift", "changed its page structure"],
    ["wrong-origin", "unexpected site"],
  ] as const) {
    scenario = nextScenario;
    const before = requests.filter(({ method }) => method === "GET").length;
    await lookup(expected);
    const attempts = requests
      .filter(({ method }) => method === "GET")
      .slice(before);
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts.length).toBeLessThanOrEqual(
      nextScenario === "wrong-origin" ? 2 : 1,
    );
  }

  scenario = "fallback";
  await setEditions(["de", "en"]);
  const beforeFallback = requests.filter(
    ({ method }) => method === "GET",
  ).length;
  await lookup("English fallback");
  const fallbackEditions = requests
    .filter(({ method }) => method === "GET")
    .slice(beforeFallback)
    .map(({ edition }) => edition);
  expect(fallbackEditions.length).toBeGreaterThanOrEqual(2);
  expect(fallbackEditions.length % 2).toBe(0);
  for (let index = 0; index < fallbackEditions.length; index += 2) {
    expect(fallbackEditions.slice(index, index + 2)).toEqual(["de", "en"]);
  }
});

test("times out and suppresses late definition results", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(45_000);
  await context.route(
    /^https:\/\/en\.wiktionary\.org\/w\/api\.php/,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "api-user-agent",
            "access-control-allow-methods": "GET",
          },
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 9_000));
      await route
        .fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            parse: {
              title: "говорить",
              revid: 1,
              text: '<h2 id="Russian">Russian</h2><h3 id="Verb">Verb</h3><ol><li>late</li></ol>',
            },
          }),
        })
        .catch(() => undefined);
    },
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(async () => {
    const script = document.createElement("script");
    script.src = "/page-integration.js";
    await new Promise<void>((resolve, reject) => {
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("load failed")), {
        once: true,
      });
      document.head.append(script);
    });
  });
  await waitForPageIntegration(page);

  await page.keyboard.press("Alt+Shift+d");
  await page.getByLabel("Russian word").fill("говорить");
  await page.getByRole("button", { name: "Look up" }).click();
  const dialog = page.locator("[data-slava-root] .dialog");
  await expect(dialog).toContainText(
    "Wiktionary did not respond within eight seconds",
    { timeout: 30_000 },
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);
  await page.waitForTimeout(1_100);
  await expect(page.locator("[data-slava-root]")).toHaveCount(0);
});

test("rejects replayed definition messages without an extra GET", async ({
  context,
  extensionId,
}) => {
  let getCount = 0;
  const fixture = JSON.parse(
    await readFile(
      path.resolve("tests/fixtures/mediawiki/en/говорить.json"),
      "utf8",
    ),
  ) as { response: unknown };
  await context.route(
    /^https:\/\/en\.wiktionary\.org\/w\/api\.php/,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "api-user-agent",
            "access-control-allow-methods": "GET",
          },
        });
        return;
      }
      getCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(fixture.response),
      });
    },
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  const responses = await page.evaluate(async () => {
    const extensionGlobal = globalThis as unknown as {
      chrome: {
        runtime: {
          sendMessage(message: unknown): Promise<unknown>;
        };
      };
    };
    const request = {
      kind: "definition.lookup",
      payload: {
        contractVersion: 2,
        requestId: "replayed-browser-request",
        lemma: "говорить",
        editions: ["en"],
      },
    };
    return Promise.all([
      extensionGlobal.chrome.runtime.sendMessage(request),
      extensionGlobal.chrome.runtime.sendMessage(request),
    ]);
  });

  expect(getCount).toBe(1);
  expect(responses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "definition.result",
        payload: expect.objectContaining({ code: "aborted" }),
      }),
      expect.objectContaining({
        kind: "definition.result",
        payload: expect.objectContaining({ resolvedEdition: "en" }),
      }),
    ]),
  );
});

test.describe("live Wiktionary service-worker access", () => {
  test.skip(
    process.env.SLAVA_LIVE_MEDIAWIKI !== "1",
    "Set SLAVA_LIVE_MEDIAWIKI=1 to run live network verification",
  );

  const liveTitles: Record<DefinitionEdition, string> = {
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
  for (const edition of Object.keys(liveTitles) as DefinitionEdition[]) {
    test(`${edition} accepts the bounded Action API request`, async ({
      context,
      serviceWorker,
    }) => {
      const observedRequests: Array<{
        apiUserAgent: string | undefined;
        method: string;
      }> = [];
      const observeRequest = (request: Request) => {
        const url = new URL(request.url());
        if (
          url.hostname === `${edition}.wiktionary.org` &&
          url.pathname === "/w/api.php"
        ) {
          observedRequests.push({
            apiUserAgent: request.headers()["api-user-agent"],
            method: request.method(),
          });
        }
      };
      context.on("request", observeRequest);

      const result = await serviceWorker.evaluate(
        async ({
          edition,
          responseLimit,
          title,
        }: {
          edition: DefinitionEdition;
          responseLimit: number;
          title: string;
        }) => {
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

          const response = await fetch(url, {
            credentials: "omit",
            headers: {
              "Api-User-Agent":
                "SlavaRussianDictionaryTest/0.1 (https://github.com/algattik/SlavaTranslator)",
            },
            signal: AbortSignal.timeout(8_000),
          });
          const text = await response.text();
          return {
            byteLength: new TextEncoder().encode(text).byteLength,
            contentType: response.headers.get("content-type"),
            finalOrigin: new URL(response.url).origin,
            json: JSON.parse(text) as { parse?: { revid?: number } },
            ok: response.ok,
            responseLimit,
          };
        },
        {
          edition,
          responseLimit: DEFINITION_RESPONSE_LIMIT_BYTES,
          title: liveTitles[edition],
        },
      );
      context.off("request", observeRequest);

      expect(result.ok).toBe(true);
      expect(result.finalOrigin).toBe(`https://${edition}.wiktionary.org`);
      expect(result.contentType).toContain("application/json");
      expect(result.byteLength).toBeLessThanOrEqual(result.responseLimit);
      expect(result.json.parse?.revid).toBeGreaterThan(0);
      const observedGets = observedRequests.filter(
        ({ method }) => method === "GET",
      );
      expect(observedGets).toHaveLength(1);
      expect(observedGets[0]?.apiUserAgent).toBe(
        "SlavaRussianDictionaryTest/0.1 (https://github.com/algattik/SlavaTranslator)",
      );
      expect(
        observedRequests.filter(({ method }) => method === "OPTIONS").length,
      ).toBeLessThanOrEqual(1);
    });
  }
});
