import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { z } from "zod";

const workspaceRoot = process.cwd();
const clientAssetsDir = path.join(workspaceRoot, "dist", "client", "_astro");
const workerServerDir = path.join(workspaceRoot, "dist", "server");
const workerEntryPath = path.join(workspaceRoot, "dist", "server", "entry.mjs");
const wranglerConfigPath = path.join(
  workspaceRoot,
  "dist",
  "server",
  "wrangler.json",
);
const vueInitializerPattern = /^init_[A-Za-z0-9_]+$/;

const WranglerBundleSchema = z.looseObject({
  main: z.literal("entry.mjs"),
  no_bundle: z.literal(true),
  compatibility_flags: z.array(z.string()),
  assets: z.looseObject({ binding: z.string().min(1) }),
  durable_objects: z.looseObject({
    bindings: z.array(z.looseObject({ name: z.string().min(1) })),
  }),
  kv_namespaces: z.array(z.looseObject({ binding: z.string().min(1) })),
  queues: z.looseObject({
    producers: z.array(z.looseObject({ binding: z.string().min(1) })),
    consumers: z.array(z.looseObject({ queue: z.string().min(1) })),
  }),
  r2_buckets: z.array(z.looseObject({ binding: z.string().min(1) })),
  d1_databases: z.array(z.looseObject({ binding: z.string().min(1) })),
  ai: z.looseObject({ binding: z.string().min(1) }),
});

type BundleProblem = {
  file: string;
  message: string;
};

/** Recursively lists files below a generated bundle directory. */
async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(
      /** Recursively expands a bundle directory entry into files. */
      (entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
      },
    ),
  );
  return files.flat();
}

/** Collects configured Cloudflare binding names from nested configuration data. */
function collectBindingNames(
  name: ts.BindingName,
  bindings: Set<string>,
): void {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingNames(element.name, bindings);
    }
  }
}

/** Collects identifiers declared in a generated JavaScript bundle. */
function collectDeclaredIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const declared = new Set<string>();

  /** Visits syntax nodes and records every declared binding. */
  function visit(node: ts.Node): void {
    if (ts.isImportClause(node) && node.name) {
      declared.add(node.name.text);
    } else if (ts.isImportSpecifier(node)) {
      declared.add(node.name.text);
    } else if (ts.isNamespaceImport(node)) {
      declared.add(node.name.text);
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      declared.add(node.name.text);
    } else if (ts.isVariableDeclaration(node)) {
      collectBindingNames(node.name, declared);
    } else if (ts.isParameter(node)) {
      collectBindingNames(node.name, declared);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      collectBindingNames(node.variableDeclaration.name, declared);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declared;
}

/** Finds Vue initializer calls whose imported helper is not declared. */
function findUnboundVueInitializers(
  sourceFile: ts.SourceFile,
  declared: ReadonlySet<string>,
): Set<string> {
  const unbound = new Set<string>();

  /** Visits call expressions and records missing Vue initializer bindings. */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      vueInitializerPattern.test(node.expression.text) &&
      !declared.has(node.expression.text)
    ) {
      unbound.add(node.expression.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return unbound;
}

/** Inspects a JavaScript bundle for generated-code integrity problems. */
async function inspectJavaScriptBundle(
  filePath: string,
): Promise<BundleProblem[]> {
  const source = await readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declared = collectDeclaredIdentifiers(sourceFile);
  const unbound = findUnboundVueInitializers(sourceFile, declared);

  return [...unbound].map(
    /** Converts an unbound initializer into a bundle problem. */
    (initializer) => ({
      file: path.relative(workspaceRoot, filePath),
      message: `unbound Vue/Rolldown initializer ${initializer}()`,
    }),
  );
}

/** Inspects a CSS bundle for invalid or truncated output. */
async function inspectCssBundle(filePath: string): Promise<BundleProblem[]> {
  const source = await readFile(filePath, "utf8");
  if (!/(?:^|[;}])\s*@unocss\s*;/.test(source)) {
    return [];
  }

  return [
    {
      file: path.relative(workspaceRoot, filePath),
      message: "literal @unocss directive reached the production bundle",
    },
  ];
}

/** Returns the static text represented by a TypeScript property name. */
function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

/** Checks the generated Worker entry for unsupported runtime dependencies. */
async function inspectWorkerEntry(): Promise<BundleProblem[]> {
  const source = await readFile(workerEntryPath, "utf8");
  const sourceFile = ts.createSourceFile(
    workerEntryPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let defaultLocalName: string | undefined;
  const namedExports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      namedExports.add(element.name.text);
      if (element.name.text === "default") {
        defaultLocalName = (element.propertyName ?? element.name).text;
      }
    }
  }

  const problems: BundleProblem[] = [];
  if (!namedExports.has("AriaStudioAgent")) {
    problems.push({
      file: path.relative(workspaceRoot, workerEntryPath),
      message: "missing AriaStudioAgent export",
    });
  }
  if (!defaultLocalName) {
    problems.push({
      file: path.relative(workspaceRoot, workerEntryPath),
      message: "missing default Worker export",
    });
    return problems;
  }

  let defaultWorkerMethods: Set<string> | undefined;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === defaultLocalName &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        defaultWorkerMethods = new Set(
          declaration.initializer.properties.flatMap(
            /** Extracts callable names from the default Worker export. */
            (property) => {
              if (
                ts.isMethodDeclaration(property) ||
                ts.isPropertyAssignment(property)
              ) {
                const name = propertyNameText(property.name);
                return name ? [name] : [];
              }
              return [];
            },
          ),
        );
      }
    }
  }

  for (const method of ["fetch", "queue", "scheduled"] as const) {
    if (!defaultWorkerMethods?.has(method)) {
      problems.push({
        file: path.relative(workspaceRoot, workerEntryPath),
        message: `default Worker export is missing ${method}()`,
      });
    }
  }

  return problems;
}

/** Inspects a Worker runtime chunk for imports and globals that workerd cannot load. */
async function inspectWorkerRuntimeFile(
  filePath: string,
): Promise<BundleProblem[]> {
  const source = await readFile(filePath, "utf8");
  const forbidden = [
    {
      pattern: /(?:node:)?child_process/u,
      message: "Node subprocess support reached the Worker bundle",
    },
    {
      pattern: /\bcreateRequire\s*\(\s*import\.meta\.url\s*\)/u,
      message:
        "CommonJS createRequire() loader reached the Worker bundle",
    },
    {
      pattern:
        /Unable to resolve npm's JavaScript CLI|aria-wrangler-sql-|Unsupported deployment command/u,
      message: "Node command orchestration reached the Worker bundle",
    },
  ];
  return forbidden.flatMap(
    /** Converts each matched forbidden pattern into a bundle problem. */
    ({ pattern, message }) =>
      pattern.test(source)
        ? [{ file: path.relative(workspaceRoot, filePath), message }]
        : [],
  );
}

/** Extracts binding names from parsed Wrangler resource definitions. */
function bindingNames<T extends { binding: string }>(
  bindings: readonly T[],
): Set<string> {
  return new Set(
    bindings.map(
      /** Selects the binding name from a Wrangler resource entry. */
      ({ binding }) => binding,
    ),
  );
}

/** Checks every generated Wrangler bundle file for integrity problems. */
async function inspectWranglerBundle(): Promise<BundleProblem[]> {
  const source = await readFile(wranglerConfigPath, "utf8");
  const parsedJson: unknown = JSON.parse(source);
  const parsed = WranglerBundleSchema.safeParse(parsedJson);
  const relativePath = path.relative(workspaceRoot, wranglerConfigPath);

  if (!parsed.success) {
    return [
      {
        file: relativePath,
        message: `invalid generated Wrangler config: ${z.prettifyError(parsed.error)}`,
      },
    ];
  }

  const config = parsed.data;
  const problems: BundleProblem[] = [];
  const requiredFlags = ["nodejs_compat"];
  const requiredBindings = {
    kv: ["aria_cache", "session"],
    queue: ["aria_email_queue", "aria_thumbnail_queue"],
    r2: ["aria_r2"],
    d1: ["aria_db"],
    durableObject: ["aria_studio_agent", "aria_studio_live"],
  } as const;

  for (const flag of requiredFlags) {
    if (!config.compatibility_flags.includes(flag)) {
      problems.push({
        file: relativePath,
        message: `missing compatibility flag ${flag}`,
      });
    }
  }

  if (config.compatibility_flags.includes("disable_nodejs_process_v2")) {
    problems.push({
      file: relativePath,
      message:
        "legacy disable_nodejs_process_v2 flag breaks Astro 7 logging and response handling in workerd",
    });
  }

  const bindingGroups = {
    kv: bindingNames(config.kv_namespaces),
    queue: bindingNames(config.queues.producers),
    r2: bindingNames(config.r2_buckets),
    d1: bindingNames(config.d1_databases),
    durableObject: new Set(
      config.durable_objects.bindings.map(
        /** Selects a Durable Object binding name. */
        ({ name }) => name,
      ),
    ),
  } satisfies Record<keyof typeof requiredBindings, Set<string>>;

  for (const [group, expectedBindings] of Object.entries(requiredBindings) as [
    keyof typeof requiredBindings,
    readonly string[],
  ][]) {
    for (const binding of expectedBindings) {
      if (!bindingGroups[group].has(binding)) {
        problems.push({
          file: relativePath,
          message: `missing ${group} binding ${binding}`,
        });
      }
    }
  }

  if (config.ai.binding !== "ai") {
    problems.push({ file: relativePath, message: "missing ai binding" });
  }
  if (config.assets.binding !== "aria_assets") {
    problems.push({
      file: relativePath,
      message: "missing aria_assets binding",
    });
  }
  if (config.queues.consumers.length === 0) {
    problems.push({ file: relativePath, message: "missing queue consumers" });
  }

  return problems;
}

/** Runs all generated bundle integrity checks and reports any problems. */
async function main(): Promise<void> {
  const entries = await readdir(clientAssetsDir, { withFileTypes: true });
  const workerRuntimeFiles = (await listFiles(workerServerDir)).filter(
    /** Keeps JavaScript modules emitted for the Worker runtime. */
    (file) => /\.[cm]?js$/u.test(file),
  );
  const problems: BundleProblem[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(clientAssetsDir, entry.name);

    if (entry.name.endsWith(".js")) {
      problems.push(...(await inspectJavaScriptBundle(filePath)));
    } else if (entry.name.endsWith(".css")) {
      problems.push(...(await inspectCssBundle(filePath)));
    }
  }

  for (const filePath of workerRuntimeFiles) {
    problems.push(...(await inspectWorkerRuntimeFile(filePath)));
  }
  problems.push(...(await inspectWorkerEntry()));
  problems.push(...(await inspectWranglerBundle()));

  if (problems.length > 0) {
    const details = problems
      /** Formats one bundle problem for the final error message. */
      .map(({ file, message }) => `- ${file}: ${message}`)
      .join("\n");
    throw new Error(`Vite bundle integrity check failed:\n${details}`);
  }

  console.log(
    `Vite/Cloudflare bundle integrity check passed (${entries.length} client assets and ${workerRuntimeFiles.length} Worker modules inspected).`,
  );
}

await main();
