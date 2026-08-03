import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

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
const NORMALIZER_FUNCTIONS = new Set([
  "normalizeSurfaceForPersistence",
  "prepareNormalizedSurfaceVersion",
]);

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

function scriptKindForFile(file: string): ts.ScriptKind {
  return /\.(?:mjs|js)$/u.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function enclosingWriterScope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node;
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current)) {
    current = current.parent;
  }
  return current ?? node.getSourceFile();
}

function isAwaitedNormalizerCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    NORMALIZER_FUNCTIONS.has(node.expression.text) &&
    node.parent !== undefined &&
    ts.isAwaitExpression(node.parent)
  );
}

/** Flags each direct DSL version-table writer not normalized in its own scope. */
export function inspectRenderingWriterSource(
  file: string,
  source: string,
): RenderingWriterBoundaryProblem | null {
  if (!VERSION_WRITE_RE.test(source) || !DSL_COLUMN_RE.test(source)) {
    return null;
  }
  if (!NORMALIZER_IMPORT_RE.test(source)) {
    return {
      file,
      message:
        "direct Page/Layout/Component dsl_json write does not use the shared surface normalizer",
    };
  }

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(file),
  );
  const writes: Array<{ scope: ts.Node; position: number }> = [];
  const normalizers: Array<{ scope: ts.Node; position: number }> = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) &&
      VERSION_WRITE_RE.test(node.text) &&
      DSL_COLUMN_RE.test(node.text)
    ) {
      writes.push({
        scope: enclosingWriterScope(node),
        position: node.getStart(sourceFile),
      });
    }
    if (isAwaitedNormalizerCall(node)) {
      normalizers.push({
        scope: enclosingWriterScope(node),
        position: node.getStart(sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const unsafeWrite = writes.some(
    (write) =>
      !normalizers.some(
        (normalizer) =>
          normalizer.scope === write.scope &&
          normalizer.position < write.position,
      ),
  );
  if (!unsafeWrite && writes.length > 0) {
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
