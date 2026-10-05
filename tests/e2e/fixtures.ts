import {
  chromium,
  test as base,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import path from "node:path";

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({ browserName }, use) => {
    if (browserName !== "chromium") {
      throw new Error("Extension tests require Playwright Chromium");
    }
    const extensionPath = path.resolve(
      process.env.SLAVA_EXTENSION_PATH ?? ".output/chrome-mv3",
    );
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        "--enable-precise-memory-info",
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await use(serviceWorker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = new URL(serviceWorker.url()).hostname;
    await use(extensionId);
  },
});

export const expect = test.expect;
