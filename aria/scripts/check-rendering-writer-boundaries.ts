import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { isMainModule } from "./lib/node-command";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const scanRoots = [
  path.resolve(workspaceRoot, "aria/lib"),
  path.resolve(workspaceRoot, "aria/scripts"),
];

const VERSION_WRITE_RE =
  /(?:INSERT(?:\s+OR\s+(?:IGNORE|REPLACE))?\s+INTO|UPDATE)\s+aria_(?:page|layout|component)_versions\b/iu;
const DSL_COLUMN_RE = /\bdsl_json\b/iu;
const NORMALIZER_IMPORT_RE = /from\s+["'][^"']*surfaceNormalization["']/u;
const NORMALIZER_CALL_RE =
  /await\s+(?:normalizeSurfaceForPersistence|prepareNormalizedSurfaceVersion)\s*\(/u;

export interface RenderingWriterBoundaryProblem {
  file: string;
  message: string;
}

async function listWriterSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "tests" ? [] : listWriterSources(absolute);
      }
      return entry.isFile() && /\.(?:ts|mjs|js)$/u.test(entry.name)
        ? [absolute]
        : [];
    }),
  );
  return nested.flat().sort();
}

/** Flags a direct DSL version-table writer without the shared normalizer. */
export function inspectRenderingWriterSource(
  file: string,
  source: string,
): RenderingWriterBoundaryProblem | null {
  if (!VERSION_WRITE_RE.test(source) || !DSL_COLUMN_RE.test(source)) {
    return null;
  }
  if (NORMALIZER_IMPORT_RE.test(source) && NORMALIZER_CALL_RE.test(source)) {
    return null;
  }
  return {
    file,
    message:
      "direct Page/Layout/Component dsl_json write does not use the shared surface normalizer",
  };
}

export async function checkRenderingWriterBoundaries(): Promise<void> {
  const files = (await Promise.all(scanRoots.map(listWriterSources))).flat();
  const problems = (
    await Promise.all(
      files.map(async (file) =>
        inspectRenderingWriterSource(file, await readFile(file, "utf8")),
      ),
    )
  ).filter(
    (problem): problem is RenderingWriterBoundaryProblem => problem !== null,
  );

  if (problems.length > 0) {
    const detail = problems
      .map(
        (problem) =>
          `${path.relative(workspaceRoot, problem.file)}: ${problem.message}`,
      )
      .join("\n");
    throw new Error(`Rendering writer boundary failed:\n${detail}`);
  }

  console.log(
    "Rendering writer boundary passed: every direct surface DSL writer references the shared normalizer.",
  );
}

if (isMainModule(import.meta.url)) {
  await checkRenderingWriterBoundaries();
}
