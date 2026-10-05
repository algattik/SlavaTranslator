import { execFileSync } from "node:child_process";
import { readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (
  typeof packageJson !== "object" ||
  packageJson === null ||
  typeof packageJson.name !== "string" ||
  typeof packageJson.version !== "string"
) {
  throw new Error("Invalid package identity");
}
const archive = path.resolve(
  `.output/${packageJson.name}-${packageJson.version}-chrome.zip`,
);
const output = path.resolve(".output/packaged-smoke");
const entries = execFileSync("unzip", ["-Z1", archive], {
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean);

for (const entry of entries) {
  if (
    path.posix.isAbsolute(entry) ||
    entry.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe packaged ZIP entry: ${entry}`);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
execFileSync("unzip", ["-q", archive, "-d", output], { stdio: "inherit" });
