import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const evidencePath = "artifacts/release-validation.json";
const evidence = {
  schemaVersion: 1,
  checks: {},
};

await mkdir("artifacts", { recursive: true });

async function persistEvidence() {
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function run(name, args, options = {}) {
  const started = performance.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(options.command ?? npm, args, {
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout });
    });
  });
  evidence.checks[name] = {
    status: result.code === 0 ? "passed" : "failed",
    durationMilliseconds: Math.round(performance.now() - started),
  };
  await persistEvidence();
  if (result.code !== 0) {
    throw new Error(
      `${name} failed${result.signal === null ? "" : ` with ${result.signal}`}`,
    );
  }
  return result.stdout;
}

await run("format", ["run", "format:check"]);
await run("typecheck", ["run", "typecheck"]);
await run("lint", ["run", "lint"]);
await run("chromeBuild", ["run", "build"]);
await run("unitDataAndPolicy", ["run", "test:unit:report"]);
await run("deterministicChromium", ["run", "test:e2e:report"]);
await run("firefoxCompatibilityBuild", ["run", "build:firefox"]);

const auditJson = await run(
  "npmAudit",
  ["audit", "--audit-level=high", "--json"],
  { capture: true },
);
await writeFile("artifacts/npm-audit.json", auditJson);

const vitest = JSON.parse(await readFile("artifacts/vitest.json", "utf8"));
const playwright = JSON.parse(
  await readFile("artifacts/playwright.json", "utf8"),
);
const audit = JSON.parse(auditJson);
evidence.tests = {
  unitDataAndPolicy: {
    passed: vitest.numPassedTests,
    failed: vitest.numFailedTests,
    skipped: vitest.numPendingTests,
    total: vitest.numTotalTests,
  },
  deterministicChromium: {
    passed: playwright.stats.expected,
    failed: playwright.stats.unexpected,
    flaky: playwright.stats.flaky,
    skipped: playwright.stats.skipped,
  },
};
evidence.audit = {
  vulnerabilities: audit.metadata.vulnerabilities,
};
await persistEvidence();
