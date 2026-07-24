import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const workerConfigPath = path.join(
  workspaceRoot,
  "dist",
  "server",
  "wrangler.json",
);
const clientAssetsDir = path.join(workspaceRoot, "dist", "client");

// Keep an intentional safety margin below Cloudflare Workers Free's 3 MB
// compressed-script ceiling so routine feature work does not immediately
// exhaust the platform limit.
const PROJECT_GZIP_WORKER_BUDGET_BYTES = 2_700_000;
const CLOUDFLARE_FREE_GZIP_WORKER_LIMIT_BYTES = 3_000_000;
const MAX_STATIC_ASSET_FILES = 20_000;
const MAX_STATIC_ASSET_BYTES = 25 * 1024 * 1024;

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

async function inspectWorkerUpload(): Promise<number> {
  const wranglerPath = path.join(
    workspaceRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
  const { stdout, stderr } = await execFileAsync(wranglerPath, [
    "deploy",
    "--dry-run",
    "--config",
    workerConfigPath,
  ]);
  const output = `${stdout}\n${stderr}`;
  const match = /Total Upload:\s*[\d.]+\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/u.exec(
    output,
  );

  if (!match?.[1]) {
    throw new Error(
      "Unable to read Wrangler's compressed Worker size from the dry-run output.",
    );
  }

  return Math.ceil(Number(match[1]) * 1024);
}

async function main(): Promise<void> {
  const [gzipWorkerBytes, assetFiles] = await Promise.all([
    inspectWorkerUpload(),
    listFiles(clientAssetsDir),
  ]);
  const assetSizes = await Promise.all(
    assetFiles.map(async (filePath) => ({
      filePath,
      size: (await stat(filePath)).size,
    })),
  );
  const largestAsset = assetSizes.reduce(
    (largest, asset) => (asset.size > largest.size ? asset : largest),
    { filePath: "", size: 0 },
  );

  const problems: string[] = [];
  if (gzipWorkerBytes > PROJECT_GZIP_WORKER_BUDGET_BYTES) {
    problems.push(
      `compressed Worker is ${gzipWorkerBytes} bytes; the project safety budget is ${PROJECT_GZIP_WORKER_BUDGET_BYTES} bytes (Cloudflare Workers Free ceiling: ${CLOUDFLARE_FREE_GZIP_WORKER_LIMIT_BYTES} bytes)`,
    );
  }
  if (assetFiles.length > MAX_STATIC_ASSET_FILES) {
    problems.push(
      `static asset count is ${assetFiles.length}; Workers Free allows ${MAX_STATIC_ASSET_FILES}`,
    );
  }
  if (largestAsset.size > MAX_STATIC_ASSET_BYTES) {
    problems.push(
      `largest static asset is ${path.relative(workspaceRoot, largestAsset.filePath)} (${largestAsset.size} bytes); Workers Free allows ${MAX_STATIC_ASSET_BYTES} bytes per asset`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Cloudflare Workers Free limit exceeded:\n- ${problems.join("\n- ")}`);
  }

  console.log(
    `Cloudflare Workers Free limits passed: ${gzipWorkerBytes} byte gzip Worker (${PROJECT_GZIP_WORKER_BUDGET_BYTES - gzipWorkerBytes} byte project headroom; ${CLOUDFLARE_FREE_GZIP_WORKER_LIMIT_BYTES - gzipWorkerBytes} byte platform headroom), ${assetFiles.length} assets, ${largestAsset.size} byte largest asset.`,
  );
}

await main();
