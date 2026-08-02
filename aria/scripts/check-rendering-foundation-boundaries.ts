import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { build, type BuildResult, type Metafile } from "esbuild";

import { isMainModule } from "./lib/node-command";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const canonicalRoot = path.resolve(
  workspaceRoot,
  "aria/lib/rendering/canonical",
);
const bundleEntrypoint = path.resolve(
  workspaceRoot,
  "aria/tests/rendering-foundation/foundationBundleEntry.ts",
);

const FORBIDDEN_PORTABLE_MODULE_PREFIXES = [
  "node:",
  "cloudflare:",
  "astro:",
] as const;
const FORBIDDEN_PORTABLE_IDENTIFIERS = [
  "process",
  "Buffer",
  "D1Database",
  "KVNamespace",
  "R2Bucket",
  "ExecutionContext",
] as const;
const MODULE_SPECIFIER_RE =
  /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/gu;

type BoundaryProblem = Readonly<{
  file: string;
  message: string;
}>;

/** Recursively returns TypeScript sources below the portable core. */
async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(absolute);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
    }),
  );
  return nested.flat().sort();
}

/** Checks source imports and runtime globals forbidden in the canonical core. */
async function inspectPortableSources(): Promise<BoundaryProblem[]> {
  const files = await listTypeScriptFiles(canonicalRoot);
  const problems: BoundaryProblem[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(MODULE_SPECIFIER_RE)) {
      const specifier = match[1];
      if (
        specifier &&
        FORBIDDEN_PORTABLE_MODULE_PREFIXES.some((prefix) =>
          specifier.startsWith(prefix),
        )
      ) {
        problems.push({
          file,
          message: `forbidden portable import ${specifier}`,
        });
      }
    }

    for (const identifier of FORBIDDEN_PORTABLE_IDENTIFIERS) {
      const identifierPattern = new RegExp(`\\b${identifier}\\b`, "u");
      if (identifierPattern.test(source)) {
        problems.push({
          file,
          message: `forbidden portable runtime identifier ${identifier}`,
        });
      }
    }
  }

  return problems;
}

/** Bundles the shared probe for one runtime without writing generated files. */
async function bundleProbe(
  platform: "browser" | "node",
): Promise<BuildResult & { metafile: Metafile }> {
  const result = await build({
    entryPoints: [bundleEntrypoint],
    bundle: true,
    conditions:
      platform === "browser"
        ? ["worker", "browser", "import", "default"]
        : ["node", "import", "default"],
    format: "esm",
    metafile: true,
    platform,
    target: "es2022",
    treeShaking: true,
    write: false,
  });
  if (!result.metafile) {
    throw new Error(`Missing ${platform} rendering foundation metafile`);
  }
  return { ...result, metafile: result.metafile };
}

/** Joins every generated JavaScript output for boundary inspection. */
function bundleText(result: BuildResult): string {
  return (result.outputFiles ?? [])
    .map((outputFile) => outputFile.text)
    .join("\n");
}

/** Reports runtime dependencies that escaped into the wrong probe bundle. */
function inspectBundles(
  workerResult: BuildResult & { metafile: Metafile },
  nodeResult: BuildResult & { metafile: Metafile },
): BoundaryProblem[] {
  const problems: BoundaryProblem[] = [];
  const workerBundle = bundleText(workerResult);
  const nodeBundle = bundleText(nodeResult);
  const workerForbidden = [
    /\bfrom\s+["']node:/u,
    /\bimport\s*\(\s*["']node:/u,
    /\bprocess\.(?:env|versions|release)\b/u,
  ] as const;
  const nodeForbidden = [
    /\bfrom\s+["']cloudflare:/u,
    /\bimport\s*\(\s*["']cloudflare:/u,
    /\b(?:D1Database|KVNamespace|R2Bucket)\b/u,
  ] as const;

  for (const pattern of workerForbidden) {
    if (pattern.test(workerBundle)) {
      problems.push({
        file: "workerd foundation bundle",
        message: `matched forbidden Node runtime pattern ${pattern.source}`,
      });
    }
  }
  for (const pattern of nodeForbidden) {
    if (pattern.test(nodeBundle)) {
      problems.push({
        file: "Node foundation bundle",
        message: `matched forbidden Cloudflare runtime pattern ${pattern.source}`,
      });
    }
  }

  const inputs = Object.keys(workerResult.metafile.inputs);
  const forbiddenWorkerInputs = [
    "uno.user.config.ts",
    "astro.config.ts",
    "/node:crypto",
  ] as const;
  for (const token of forbiddenWorkerInputs) {
    const match = inputs.find((input) => input.includes(token));
    if (match) {
      problems.push({
        file: "workerd foundation bundle",
        message: `included forbidden configuration/runtime input ${match}`,
      });
    }
  }

  return problems;
}

/** Runs source and generated-bundle portability enforcement. */
export async function checkRenderingFoundationBoundaries(): Promise<void> {
  const sourceProblems = await inspectPortableSources();
  const [workerResult, nodeResult] = await Promise.all([
    bundleProbe("browser"),
    bundleProbe("node"),
  ]);
  const problems = [
    ...sourceProblems,
    ...inspectBundles(workerResult, nodeResult),
  ];

  if (problems.length > 0) {
    const detail = problems
      .map(
        (problem) =>
          `${path.relative(workspaceRoot, problem.file)}: ${problem.message}`,
      )
      .join("\n");
    throw new Error(`Rendering foundation boundary failed:\n${detail}`);
  }

  console.log(
    "Rendering foundation boundary passed: portable source, Node bundle, and workerd bundle are isolated.",
  );
}

if (isMainModule(import.meta.url)) {
  await checkRenderingFoundationBoundaries();
}
