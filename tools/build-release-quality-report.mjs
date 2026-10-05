import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const release = await readJson("artifacts/release-candidate-report.json");
const activation = await readJson("artifacts/activation-performance.json");
const releasePolicy = await readJson("data/config/release-policy.json");
const reproducibility = await readJson("artifacts/reproducibility.json");
const verification = await readJson("artifacts/attestation-verification.json");
const validation = await readJson("artifacts/release-validation.json");
const packaged = await readJson("artifacts/playwright-packaged.json");
const sbom = await readJson("artifacts/sbom.cdx.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const workflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/live-canary.yml",
  ".github/workflows/release-candidate.yml",
];
const workflows = Object.fromEntries(
  await Promise.all(
    workflowFiles.map(async (file) => [file, await readFile(file, "utf8")]),
  ),
);
const actionReferences = Object.values(workflows).flatMap((workflow) =>
  [...workflow.matchAll(/^\s*uses:\s*(\S+)/gmu)].map((match) => match[1]),
);
const workflowConfiguration = {
  codeql:
    workflows[".github/workflows/codeql.yml"].includes(
      "github/codeql-action/init@",
    ) &&
    workflows[".github/workflows/codeql.yml"].includes(
      "github/codeql-action/analyze@",
    ),
  dependencyReview: workflows[".github/workflows/ci.yml"].includes(
    "actions/dependency-review-action@",
  ),
  immutableActionPins:
    actionReferences.length > 0 &&
    actionReferences.every((reference) =>
      /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[a-f0-9]{40}$/u.test(reference),
    ),
};
assert(
  Object.values(workflowConfiguration).every(Boolean),
  "Workflow security configuration is incomplete",
);
for (const [name, check] of Object.entries(validation.checks)) {
  assert(check.status === "passed", `Release validation ${name} did not pass`);
}
assert(
  validation.tests.unitDataAndPolicy.failed === 0,
  "Unit, data, or policy tests failed",
);
assert(
  validation.tests.deterministicChromium.failed === 0,
  "Deterministic Chromium tests failed",
);
assert(packaged.stats.unexpected === 0, "Packaged smoke tests failed");
assert(
  activation.thresholds.functionalCompletionMilliseconds ===
    releasePolicy.budgets.activationCompletionMilliseconds &&
    activation.thresholds.rendererWorkP95Milliseconds ===
      releasePolicy.budgets.activationRendererWorkP95Milliseconds &&
    activation.thresholds.heapDeltaBytes ===
      releasePolicy.budgets.activationHeapDeltaBytes,
  "Activation evidence thresholds do not match release policy",
);
assert(
  activation.gates.functionalCompletion === "enforced" &&
    activation.gates.rendererWorkP95 ===
      releasePolicy.performance.hostedRunnerLatencyMode &&
    activation.gates.heapDelta === "enforced",
  "Activation evidence gate modes do not match hosted-runner policy",
);

let liveCanary = {
  status: "not-run",
  reason:
    "Live provider canaries run in the scheduled non-release-blocking workflow",
};
if (process.env.SLAVA_LIVE_CANARY_REPORT !== undefined) {
  const live = await readJson(process.env.SLAVA_LIVE_CANARY_REPORT);
  liveCanary = {
    status: live.stats.unexpected === 0 ? "passed" : "failed",
    passed: live.stats.expected,
    failed: live.stats.unexpected,
    flaky: live.stats.flaky,
    skipped: live.stats.skipped,
  };
}

const report = {
  schemaVersion: 1,
  package: release.package,
  archive: release.archive,
  installed: {
    bytes: release.installed.bytes,
    files: Object.keys(release.installed.files).length,
  },
  activation: {
    ...activation,
    hostedRunnerPolicy: releasePolicy.performance,
  },
  reproducibility,
  provenanceVerification: verification,
  supplyChain: {
    sbomFormat: sbom.bomFormat,
    sbomSpecVersion: sbom.specVersion,
    dependencyLicenseCount: Object.keys(release.policy.dependencyLicenses)
      .length,
    packagedDataNotices: release.policy.packagedDataNotices,
    npmAudit: validation.audit,
    workflowConfiguration,
  },
  tests: {
    unitDataAndPolicy: validation.tests.unitDataAndPolicy,
    deterministicChromium: validation.tests.deterministicChromium,
    packagedSmoke: {
      passed: packaged.stats.expected,
      failed: packaged.stats.unexpected,
      flaky: packaged.stats.flaky,
      skipped: packaged.stats.skipped,
    },
    liveCanary,
    firefoxCompatibilityBuild: validation.checks.firefoxCompatibilityBuild,
  },
};
await writeFile(
  "artifacts/release-quality-report.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
