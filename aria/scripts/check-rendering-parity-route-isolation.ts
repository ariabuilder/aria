import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SERVER_BUILD_DIRECTORY = join(process.cwd(), "dist", "server");
const FORBIDDEN_MARKERS = [
  "aria-rendering-parity",
  "rendering-parity-lifecycle",
  "p0CanvasFixture",
  "StageParitySurface",
] as const;

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const files = await collectFiles(SERVER_BUILD_DIRECTORY);
const violations: string[] = [];

for (const file of files) {
  const content = await readFile(file);
  if (content.includes(0)) {
    continue;
  }
  const text = content.toString("utf8");
  for (const marker of FORBIDDEN_MARKERS) {
    if (text.includes(marker)) {
      violations.push(`${file}: ${marker}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `Production server bundle contains rendering parity fixtures:\n${violations.join("\n")}`,
  );
}

console.info(
  `Rendering parity route isolation passed (${files.length} server files checked).`,
);
