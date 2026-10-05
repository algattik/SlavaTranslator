import { execFileSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const source = path.resolve(process.argv[2] ?? ".output/chrome-mv3");
const archive = path.resolve(
  process.argv[3] ??
    `.output/${packageJson.name}-${packageJson.version}-chrome.zip`,
);
const staging = path.resolve(".output/release-staging");
const fixedTime = new Date("2000-01-01T00:00:00.000Z");

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

if (!(await stat(source)).isDirectory()) {
  throw new Error(`Release source is not a directory: ${source}`);
}
await rm(staging, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(path.dirname(archive), { recursive: true });
await cp(source, staging, { recursive: true });
const files = await listFiles(staging);
for (const file of files) {
  const target = path.join(staging, file);
  await chmod(target, 0o644);
  await utimes(target, fixedTime, fixedTime);
}
execFileSync("zip", ["-X", "-q", "-9", archive, ...files], {
  cwd: staging,
  stdio: "inherit",
});
process.stdout.write(`${archive}\n`);
