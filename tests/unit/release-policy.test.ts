import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { WIKTIONARY_HOSTS } from "../../src/config/wiktionary-hosts";
interface ReleasePolicy {
  budgets: {
    activationHeapDeltaBytes: number;
    activationRendererWorkP95Milliseconds: number;
    installedBytes: number;
    zipBytes: number;
  };
  allowedPackageEntries: string[];
  packagedDataNotices: Record<string, string>;
}

const workflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/live-canary.yml",
  ".github/workflows/release-candidate.yml",
];

describe("release policy", () => {
  it("keeps the approved size and activation budgets executable", async () => {
    const policy = JSON.parse(
      await readFile("data/config/release-policy.json", "utf8"),
    ) as ReleasePolicy;

    expect(policy.budgets).toEqual({
      activationHeapDeltaBytes: 64 * 1024 * 1024,
      activationRendererWorkP95Milliseconds: 500,
      installedBytes: 80 * 1024 * 1024,
      zipBytes: 20 * 1024 * 1024,
    });

    const benchmark = await readFile("tests/e2e/extension.spec.ts", "utf8");
    expect(benchmark).toContain("activationRendererWorkP95Milliseconds");
    expect(benchmark).not.toContain("expect(wallClockMedian)");
  });

  it("pins every workflow action and avoids privileged pull-request execution", async () => {
    for (const file of workflowFiles) {
      const workflow = await readFile(file, "utf8");
      expect(workflow).not.toContain("pull_request_target:");
      expect(workflow).not.toMatch(/permissions:\s*write-all/u);
      for (const line of workflow.matchAll(/^\s*uses:\s*(\S+)/gmu)) {
        expect(line[1]).toMatch(
          /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[a-f0-9]{40}$/u,
        );
      }
    }

    const release = await readFile(
      ".github/workflows/release-candidate.yml",
      "utf8",
    );
    expect(release).toContain("workflow_dispatch:");
    expect(release).not.toContain("pull_request:");
  });

  it("keeps user-facing privacy and permission disclosures aligned", async () => {
    const privacy = await readFile("docs/privacy.md", "utf8");
    const store = await readFile("docs/chrome-web-store.md", "utf8");
    const readme = await readFile("README.md", "utf8");
    const security = await readFile("SECURITY.md", "utf8");

    for (const host of WIKTIONARY_HOSTS) {
      expect(privacy).toContain(host.replace("/*", ""));
      expect(store).toContain(host);
    }
    for (const excluded of [
      "page URL",
      "surrounding",
      "browsing history",
      "cookies",
      "credentials",
      "analytics",
      "telemetry",
    ]) {
      expect(privacy.toLowerCase()).toContain(excluded.toLowerCase());
      expect(store.toLowerCase()).toContain(excluded.toLowerCase());
    }
    expect(readme).toContain("Bounded hover lookup");
    expect(readme).not.toContain("Hovering over a words");
    expect(security).toContain("/security/advisories/new");
  });

  it("has no superseded MV2 or legacy pipeline roots", async () => {
    for (const legacyPath of ["chrome", "conf", "scripts"]) {
      await expect(access(legacyPath)).rejects.toThrow();
    }
  });

  it("has one deterministic Chrome release package path", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const wxt = await readFile("wxt.config.ts", "utf8");

    expect(packageJson.scripts.zip).toBe("npm run release:package");
    expect(packageJson.scripts["release:package"]).toContain(
      "tools/package-release.mjs",
    );
    expect(packageJson.scripts["release:gates"]).toContain(
      "tools/run-release-quality-gates.mjs",
    );
    expect(wxt).not.toContain("includeSources");
    expect(wxt).not.toContain("excludeSources");
  });

  it("packages attribution for every morphology source", async () => {
    const policy = JSON.parse(
      await readFile("data/config/release-policy.json", "utf8"),
    ) as ReleasePolicy;
    const sources = JSON.parse(
      await readFile("data/config/index-sources.json", "utf8"),
    ) as {
      sources: Array<{
        id: string;
        license: string;
        licenseUrl?: string;
        purpose: string;
        revision: string;
        snapshotDate: string;
        url: string;
      }>;
    };

    for (const source of sources.sources.filter(
      (candidate) => candidate.purpose === "morphology",
    )) {
      const noticeEntry = policy.packagedDataNotices[source.id];
      expect(noticeEntry).toBeTypeOf("string");
      expect(policy.allowedPackageEntries).toContain(noticeEntry);
      const notice = await readFile(`public/${noticeEntry}`, "utf8");
      for (const requiredValue of [
        source.id,
        source.revision,
        source.snapshotDate,
        source.license,
        source.url,
        source.licenseUrl,
      ].filter((value): value is string => value !== undefined)) {
        expect(notice).toContain(requiredValue);
      }
    }
  });

  it("derives release quality claims from current-run evidence", async () => {
    const reportBuilder = await readFile(
      "tools/build-release-quality-report.mjs",
      "utf8",
    );
    const releaseWorkflow = await readFile(
      ".github/workflows/release-candidate.yml",
      "utf8",
    );

    expect(reportBuilder).toContain("artifacts/release-validation.json");
    expect(reportBuilder).toContain("artifacts/playwright-packaged.json");
    expect(reportBuilder).not.toMatch(
      /unitDataAndPolicy:\s*\d+|deterministicChromium:\s*\d+|packagedSmoke:\s*\d+/u,
    );
    expect(reportBuilder).not.toContain(
      'readJson("artifacts/live-canary.json")',
    );
    expect(releaseWorkflow).toContain("npm run release:gates");
    expect(releaseWorkflow).not.toContain("npm run test:e2e:live");
  });
});
