import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const output = path.resolve(".output/chrome-mv3");
const finalArchive = path.resolve(
  `.output/${packageJson.name}-${packageJson.version}-chrome.zip`,
);
const firstArchive = path.resolve("artifacts/reproducibility-a.zip");
const secondArchive = path.resolve("artifacts/reproducibility-b.zip");

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

async function outputDigests() {
  return Object.fromEntries(
    await Promise.all(
      (await listFiles(output)).map(async (file) => [
        file,
        await sha256(path.join(output, file)),
      ]),
    ),
  );
}

async function build(archive) {
  await rm(output, { recursive: true, force: true });
  execFileSync("npm", ["run", "build"], { stdio: "inherit" });
  const files = await outputDigests();
  execFileSync(
    process.execPath,
    ["tools/package-release.mjs", output, archive],
    { stdio: "inherit" },
  );
  return { files, zipSha256: await sha256(archive) };
}

async function sourceTreeDigest() {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .filter((file) => !file.startsWith(".copilot-tracking/"))
    .sort();
  const digest = createHash("sha256");
  for (const file of listed) {
    try {
      await access(file);
    } catch {
      continue;
    }
    if (!(await stat(file)).isFile()) {
      continue;
    }
    digest.update(`${file}\0`);
    digest.update(await readFile(file));
    digest.update("\0");
  }
  return { files: listed.length, sha256: digest.digest("hex") };
}

await mkdir("artifacts", { recursive: true });
const first = await build(firstArchive);
const second = await build(secondArchive);
if (JSON.stringify(first.files) !== JSON.stringify(second.files)) {
  throw new Error("Isolated build outputs differ");
}
if (first.zipSha256 !== second.zipSha256) {
  throw new Error("Deterministic ZIP digests differ");
}
await copyFile(secondArchive, finalArchive);

const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const status = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
const tree = await sourceTreeDigest();
const stress = JSON.parse(
  await readFile("public/indexes/stress/metadata.json", "utf8"),
);
const morphology = JSON.parse(
  await readFile("public/indexes/morphology/metadata.json", "utf8"),
);
const report = {
  schemaVersion: 1,
  source: {
    head,
    workingTreeDirty: status.length > 0,
    tree,
  },
  builds: {
    isolatedBuilds: 2,
    files: Object.keys(first.files).length,
    outputDigestsEqual: true,
    zipDigestsEqual: true,
    zipSha256: first.zipSha256,
  },
  localData: {
    stressArtifactDigest: stress.artifactDigest,
    morphologyArtifactDigest: morphology.artifactDigest,
  },
};
await writeFile(
  "artifacts/reproducibility.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  "artifacts/SHA256SUMS",
  `${first.zipSha256}  ${path.basename(finalArchive)}\n`,
);
await writeFile(
  "artifacts/provenance.json",
  `${JSON.stringify(
    {
      _type: "https://in-toto.io/Statement/v1",
      subject: [
        {
          name: path.basename(finalArchive),
          digest: { sha256: first.zipSha256 },
        },
      ],
      predicateType: "https://slsa.dev/provenance/v1",
      predicate: {
        buildDefinition: {
          buildType: "https://github.com/algattik/SlavaTranslator/release/v1",
          externalParameters: {
            packageVersion: packageJson.version,
            sourceHead: head,
            sourceTreeSha256: tree.sha256,
          },
          resolvedDependencies: [
            {
              uri: "stress-index",
              digest: { sha256: stress.artifactDigest.replace("sha256:", "") },
            },
            {
              uri: "morphology-index",
              digest: {
                sha256: morphology.artifactDigest.replace("sha256:", ""),
              },
            },
          ],
        },
        runDetails: {
          builder: { id: "local:tools/verify-reproducible-release.mjs" },
          metadata: { invocationId: first.zipSha256 },
        },
      },
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(
  `Reproduced ${path.basename(finalArchive)} with SHA-256 ${first.zipSha256}\n`,
);
