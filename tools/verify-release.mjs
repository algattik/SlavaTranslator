import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const policy = JSON.parse(
  await readFile("data/config/release-policy.json", "utf8"),
);
const indexSources = JSON.parse(
  await readFile("data/config/index-sources.json", "utf8"),
);
const outputDirectory = path.resolve(".output/chrome-mv3");
const archive = path.resolve(
  `.output/${packageJson.name}-${packageJson.version}-chrome.zip`,
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function matchesPattern(value, pattern) {
  const expression = new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join("[^/]*")}$`,
    "u",
  );
  return expression.test(value);
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await listFiles(path.join(directory, entry.name), relative)),
      );
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

const entries = execFileSync("unzip", ["-Z1", archive], {
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean)
  .sort();
for (const entry of entries) {
  assert(
    !path.posix.isAbsolute(entry) &&
      !entry.split("/").some((segment) => segment === ".."),
    `Unsafe packaged ZIP entry: ${entry}`,
  );
  assert(
    policy.allowedPackageEntries.some((pattern) =>
      matchesPattern(entry, pattern),
    ),
    `Undeclared packaged ZIP entry: ${entry}`,
  );
}

const outputFiles = await listFiles(outputDirectory);
assert(
  JSON.stringify(entries) === JSON.stringify(outputFiles),
  "Packaged ZIP entries differ from the built extension output",
);

const packagedDataNotices = {};
for (const [sourceId, noticeEntry] of Object.entries(
  policy.packagedDataNotices ?? {},
)) {
  const source = indexSources.sources.find(
    (candidate) => candidate.id === sourceId,
  );
  assert(source !== undefined, `Unknown packaged data source ${sourceId}`);
  assert(entries.includes(noticeEntry), `Missing data notice ${noticeEntry}`);
  const notice = await readFile(
    path.join(outputDirectory, noticeEntry),
    "utf8",
  );
  for (const requiredValue of [
    source.id,
    source.revision,
    source.snapshotDate,
    source.license,
    source.url,
    source.licenseUrl,
  ].filter((value) => typeof value === "string")) {
    assert(
      notice.includes(requiredValue),
      `${noticeEntry} does not identify ${requiredValue}`,
    );
  }
  packagedDataNotices[sourceId] = noticeEntry;
}
for (const source of indexSources.sources.filter(
  (candidate) => candidate.purpose === "morphology",
)) {
  assert(
    source.id in packagedDataNotices,
    `Morphology source ${source.id} has no packaged data notice`,
  );
}

const manifest = JSON.parse(
  await readFile(path.join(outputDirectory, "manifest.json"), "utf8"),
);
assert(manifest.manifest_version === 3, "Release manifest is not Manifest V3");
assert(
  !manifest.host_permissions.some((origin) => origin.includes("*://")),
  "Required host permissions contain a wildcard scheme",
);
assert(
  JSON.stringify(manifest.optional_host_permissions) ===
    JSON.stringify(["http://*/*", "https://*/*"]),
  "Optional page-access wildcard permissions changed",
);

const forbiddenEntryFragments = [
  "/tests/",
  "/tools/",
  "/scripts/",
  "/fixtures/",
  "/snapshots/",
];
for (const entry of entries) {
  const normalized = `/${entry.toLowerCase()}`;
  assert(
    !forbiddenEntryFragments.some((fragment) => normalized.includes(fragment)),
    `Forbidden release content: ${entry}`,
  );
  assert(!entry.endsWith(".map"), `Source map packaged: ${entry}`);
}

for (const entry of outputFiles.filter((file) =>
  /\.(?:html|js)$/u.test(file),
)) {
  const content = await readFile(path.join(outputDirectory, entry), "utf8");
  assert(!/\beval\s*\(/u.test(content), `eval found in ${entry}`);
  assert(
    !/\bnew\s+Function\s*\(/u.test(content),
    `Function constructor found in ${entry}`,
  );
  assert(
    !/<script[^>]+src\s*=\s*["']https?:/iu.test(content),
    `Remote script found in ${entry}`,
  );
  assert(
    !/\bimport\s*\(\s*["']https?:/u.test(content),
    `Remote module import found in ${entry}`,
  );
  assert(
    !/sourceMappingURL=/u.test(content),
    `Source map reference found in ${entry}`,
  );
}

const dependencyLicenses = new Map();
for (const packageFile of await listFiles(path.resolve("node_modules"))) {
  if (!packageFile.endsWith("package.json")) {
    continue;
  }
  const dependency = JSON.parse(
    await readFile(path.join("node_modules", packageFile), "utf8"),
  );
  if (typeof dependency.name !== "string") {
    continue;
  }
  assert(
    typeof dependency.license === "string",
    `Dependency ${dependency.name} has no SPDX license expression`,
  );
  assert(
    policy.allowedLicenses.includes(dependency.license),
    `Dependency ${dependency.name} uses unapproved license ${dependency.license}`,
  );
  dependencyLicenses.set(dependency.name, dependency.license);
}

const artifactBytes = {};
let installedBytes = 0;
for (const entry of outputFiles) {
  const bytes = (await stat(path.join(outputDirectory, entry))).size;
  artifactBytes[entry] = bytes;
  installedBytes += bytes;
}
const zipBytes = (await stat(archive)).size;
assert(
  zipBytes <= policy.budgets.zipBytes,
  `ZIP is ${zipBytes} bytes; budget is ${policy.budgets.zipBytes}`,
);
assert(
  installedBytes <= policy.budgets.installedBytes,
  `Installed output is ${installedBytes} bytes; budget is ${policy.budgets.installedBytes}`,
);

const report = {
  schemaVersion: 1,
  package: {
    name: packageJson.name,
    version: packageJson.version,
  },
  archive: {
    path: path.relative(process.cwd(), archive),
    bytes: zipBytes,
    sha256: await sha256(archive),
  },
  installed: {
    path: path.relative(process.cwd(), outputDirectory),
    bytes: installedBytes,
    files: artifactBytes,
  },
  policy: {
    zipBudgetBytes: policy.budgets.zipBytes,
    installedBudgetBytes: policy.budgets.installedBytes,
    packagedEntries: entries.length,
    packagedDataNotices,
    dependencyLicenses: Object.fromEntries(
      [...dependencyLicenses].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  },
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/release-candidate-report.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `Verified ${entries.length} packaged files: ${zipBytes} ZIP bytes, ${installedBytes} installed bytes\n`,
);
