import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const rootDir = resolve(import.meta.dirname, "../..");

type PackedFile = {
  path: string;
  mode: number;
};

type PackResult = {
  filename: string;
  entryCount: number;
  size: number;
  unpackedSize: number;
  files: PackedFile[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  return execFile(command, args, {
    cwd: options.cwd ?? rootDir,
    env: {
      ...process.env,
      npm_config_cache:
        process.env.npm_config_cache ?? join(tmpdir(), "aria-npm-cache"),
      ...options.env,
    },
    maxBuffer: 1024 * 1024 * 20,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const tempDir = await mkdtemp(join(tmpdir(), "aria-pack-smoke-"));

try {
  const { stdout } = await run("npm", [
    "pack",
    "--json",
    "--pack-destination",
    tempDir,
  ]);
  const jsonStart = stdout.indexOf("[");
  assert(jsonStart >= 0, "npm pack did not emit JSON output.");
  const packResults = JSON.parse(stdout.slice(jsonStart)) as PackResult[];
  const packResult = packResults[0];
  assert(packResult, "npm pack did not produce a tarball.");

  const packedPaths = new Set(packResult.files.map((file) => file.path));
  const forbiddenPrefixes = [
    ".github/",
    "aria/tests/",
    "aria/storage/exports/",
    "dev/",
    "public/uploads/_imports/",
    "todo/",
  ];
  const forbiddenExact = new Set([
    "aria/storage/aria.db",
    "package-lock.json",
    "vitest.config.ts",
    "tsconfig.tsbuildinfo",
  ]);

  for (const file of packResult.files) {
    assert(
      !forbiddenPrefixes.some((prefix) => file.path.startsWith(prefix)),
      `Packed forbidden file: ${file.path}`,
    );
    assert(
      !file.path.startsWith("public/uploads/") ||
        file.path === "public/uploads/.gitkeep",
      `Packed local upload: ${file.path}`,
    );
    assert(!forbiddenExact.has(file.path), `Packed forbidden file: ${file.path}`);
  }

  assert(
    packedPaths.has("dist/cli/main.js"),
    "Packed tarball is missing dist/cli/main.js.",
  );
  assert(
    packedPaths.has("wrangler.jsonc"),
    "Packed tarball is missing wrangler.jsonc.",
  );
  assert(
    packedPaths.has("README.md"),
    "Packed tarball is missing README.md.",
  );
  assert(
    packedPaths.has("LICENSE"),
    "Packed tarball is missing LICENSE.",
  );

  const cliFile = packResult.files.find(
    (file) => file.path === "dist/cli/main.js",
  );
  assert(cliFile, "Unable to inspect dist/cli/main.js mode.");
  assert(
    (cliFile.mode & 0o111) !== 0,
    "dist/cli/main.js is not executable in the packed tarball.",
  );

  const tarball = join(tempDir, packResult.filename);
  const installDir = join(tempDir, "install");
  await mkdir(installDir);
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: installDir },
  );

  const cliPath = join(installDir, "node_modules/.bin/aria");
  await run(cliPath, ["--help"], { cwd: installDir });
  await run(cliPath, ["--version"], { cwd: installDir });
  await run(cliPath, ["doctor", "--help"], { cwd: installDir });
  await run(cliPath, ["schema", "cms", "--help"], { cwd: installDir });
  await run(cliPath, ["seed", "apply", "--help"], { cwd: installDir });

  console.log(
    `Pack smoke passed: ${packResult.entryCount} files, ${formatBytes(
      packResult.size,
    )} tarball, ${formatBytes(packResult.unpackedSize)} unpacked.`,
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
