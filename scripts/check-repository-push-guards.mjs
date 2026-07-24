import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PATH_LENGTH = 256;

const forbiddenNames = new Set([
  ".env",
  ".dev.vars",
  "credentials.json",
  "secrets.json",
  "id_rsa",
  "id_rsa.pub",
  "id_ed25519",
  "id_ed25519.pub",
]);

const forbiddenExtensions = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".jar",
  ".bin",
  ".apk",
  ".dmg",
  ".iso",
]);

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const violations = [];

for (const file of trackedFiles) {
  const name = path.posix.basename(file);
  const extension = path.posix.extname(name).toLowerCase();
  const isSafeExample =
    name === ".env.example" || name === ".dev.vars.example";

  if (
    forbiddenNames.has(name) ||
    (!isSafeExample &&
      (name.startsWith(".env.") || name.startsWith(".dev.vars."))) ||
    extension === ".pem"
  ) {
    violations.push(`${file}: restricted secret or credential path`);
  }

  if (forbiddenExtensions.has(extension)) {
    violations.push(`${file}: restricted file extension`);
  }

  if ([...file].length > MAX_PATH_LENGTH) {
    violations.push(
      `${file}: path exceeds ${MAX_PATH_LENGTH} characters`,
    );
  }

  const fileSize = lstatSync(file).size;
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    violations.push(`${file}: file exceeds 10 MiB`);
  }
}

if (violations.length > 0) {
  console.error("Repository push guard failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `Repository push guard passed for ${trackedFiles.length} tracked files.`,
);
