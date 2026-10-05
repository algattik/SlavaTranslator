import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const archive = `.output/${packageJson.name}-${packageJson.version}-chrome.zip`;
const provenance = JSON.parse(
  await readFile("artifacts/provenance.json", "utf8"),
);
const release = JSON.parse(
  await readFile("artifacts/release-candidate-report.json", "utf8"),
);
const checksums = await readFile("artifacts/SHA256SUMS", "utf8");
const digest = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
const subject = provenance.subject?.find(
  (candidate) => candidate.name === path.basename(archive),
);

if (subject?.digest?.sha256 !== digest) {
  throw new Error("Provenance subject digest does not match the release ZIP");
}
if (release.archive?.sha256 !== digest) {
  throw new Error("Release report digest does not match the release ZIP");
}
if (!checksums.includes(`${digest}  ${path.basename(archive)}`)) {
  throw new Error("SHA256SUMS does not match the release ZIP");
}

await writeFile(
  "artifacts/attestation-verification.json",
  `${JSON.stringify(
    {
      schemaVersion: 1,
      archive,
      sha256: digest,
      localProvenanceStatementVerified: true,
      githubArtifactAttestation:
        "configured in the manual release-candidate workflow; generated and verified only when that privileged workflow runs",
    },
    null,
    2,
  )}\n`,
);
