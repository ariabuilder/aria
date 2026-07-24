#!/usr/bin/env node
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";

const ARIA_PRIMARY = "\x1b[38;2;13;129;119m";
const ANSI_RESET = "\x1b[0m";
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);
const DEFAULT_SCHEMA_OUT = "aria/docs/openapi/cms-actions.json";
const SeedManifestCollectionNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a collection API name");

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

type DoctorStatus = "pass" | "warn" | "fail";

type DoctorCheck = {
  status: DoctorStatus;
  label: string;
  detail?: string;
};

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }

  return Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb";
}

function aria(text: string): string {
  return colorEnabled() ? `${ARIA_PRIMARY}${text}${ANSI_RESET}` : text;
}

function print(message = ""): void {
  process.stdout.write(`${message}\n`);
}

function printError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function hasHelpFlag(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

async function readPackageJson(): Promise<{
  name?: string;
  version?: string;
  engines?: { node?: string };
}> {
  const raw = await readFile(PACKAGE_JSON_URL, "utf8");
  return JSON.parse(raw) as {
    name?: string;
    version?: string;
    engines?: { node?: string };
  };
}

async function readVersion(): Promise<string> {
  const packageJson = await readPackageJson();
  return packageJson.version ?? "0.0.0";
}

function header(): string {
  return `${aria("◆ Aria")}\n\n  The visual builder for the Cloudflare era — Astro-native, built for the edge.`;
}

function rootHelp(): string {
  return `${header()}

${aria("Usage")}
  aria <command> [options]

${aria("Commands")}
  doctor          Check your Aria project setup
  types           Generate aria-env.d.ts from CMS collections
  schema cms      Generate the CMS action schema
  seed apply      Apply a CMS seed file
  import markdown Import Markdown files into an existing collection

${aria("Examples")}
  aria doctor
  aria types
  aria schema cms --out ${DEFAULT_SCHEMA_OUT}
  aria seed apply ./seed.json --dry-run
  aria import markdown ./content/blog --collection blog --dry-run

Run aria <command> --help for command-specific help.`;
}

function typesHelp(): string {
  return `${header()}

${aria("Usage")}
  aria types [--out aria-env.d.ts]

${aria("Options")}
  --out <path>    Output declaration file path`;
}

function schemaHelp(): string {
  return `${header()}

${aria("Usage")}
  aria schema cms [--out ${DEFAULT_SCHEMA_OUT}]

${aria("Options")}
  --out <path>    Output schema JSON path`;
}

function seedApplyHelp(): string {
  return `${header()}

${aria("Usage")}
  aria seed apply <seed-file.json> [--dry-run]

${aria("Options")}
  --dry-run       Validate and preview the seed without writing`;
}

function markdownImportHelp(): string {
  return `${header()}

${aria("Usage")}
  aria import markdown <file-or-directory> --collection <name-or-id> [--dry-run] [--update-existing]

${aria("Options")}
  --collection <value>  Existing CMS collection name or id
  --dry-run             Validate and preview without writing
  --update-existing     Update matching locale and slug entries`;
}

function doctorHelp(): string {
  return `${header()}

${aria("Usage")}
  aria doctor

Checks the local Node, Astro, Cloudflare, and Aria project setup without changing files.`;
}

async function runTypesCommand(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    print(typesHelp());
    return;
  }

  const parsed = parseArgs({
    args,
    options: {
      out: { type: "string", default: "aria-env.d.ts" },
    },
  });

  const [{ getStorageAdapterAsync }, { generateAriaEnvDts }] =
    await Promise.all([
      import("../lib/storage/getStorageAdapter"),
      import("../lib/cms/typegen"),
    ]);
  const adapter = await getStorageAdapterAsync();
  const collections = await adapter.listCollections();
  const content = generateAriaEnvDts(collections);
  const outPath = resolve(process.cwd(), parsed.values.out ?? "aria-env.d.ts");
  await writeFile(outPath, content, "utf8");
  print(`${aria("✓")} Wrote ${outPath}`);
}

async function runSeedApplyCommand(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    print(seedApplyHelp());
    return;
  }

  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
    },
  });

  const seedPath = parsed.positionals[0];
  if (!seedPath) {
    throw new CliError("Usage: aria seed apply <seed-file.json> [--dry-run]");
  }

  const [
    { getStorageAdapterAsync },
    { applyAriaSeed, AriaSeedPackageSchema },
    cmsTypes,
  ] = await Promise.all([
    import("../lib/storage/getStorageAdapter"),
    import("../lib/cms/seed"),
    import("../lib/export/cmsTypes"),
  ]);
  const seed = await loadSeedInput({
    path: resolve(process.cwd(), seedPath),
    AriaSeedPackageSchema,
    SeedManifestSchema: cmsTypes.SeedManifestSchema,
    ExportedCollectionManifestSchema: cmsTypes.ExportedCollectionManifestSchema,
    ExportedEntrySchema: cmsTypes.ExportedEntrySchema,
  });
  const adapter = await getStorageAdapterAsync();
  const report = await applyAriaSeed(adapter, seed, {
    actor: {
      id: "cli-seed",
      username: "cli",
      email: "cli@aria.local",
    },
    dryRun: parsed.values["dry-run"] ?? false,
  });

  print(JSON.stringify(report, null, 2));
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const items = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    items.map(async (item) => {
      const itemPath = join(directory, item.name);
      if (item.isDirectory()) return listMarkdownFiles(itemPath);
      return item.isFile() && /\.mdx?$/i.test(item.name) ? [itemPath] : [];
    }),
  );
  return nested.flat().sort();
}

async function runMarkdownImportCommand(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    print(markdownImportHelp());
    return;
  }
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      collection: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "update-existing": { type: "boolean", default: false },
    },
  });
  const sourcePath = parsed.positionals[0];
  const collectionId = parsed.values.collection;
  if (!sourcePath || !collectionId) {
    throw new CliError(
      "Usage: aria import markdown <file-or-directory> --collection <name-or-id> [--dry-run] [--update-existing]",
    );
  }
  const absolute = resolve(process.cwd(), sourcePath);
  let sourceFiles: string[];
  try {
    const { stat } = await import("node:fs/promises");
    sourceFiles = (await stat(absolute)).isDirectory()
      ? await listMarkdownFiles(absolute)
      : [absolute];
  } catch {
    throw new CliError(`Markdown source was not found: ${absolute}`);
  }
  if (sourceFiles.length === 0)
    throw new CliError("No .md or .mdx files found.");
  if (sourceFiles.some((file) => !/\.mdx?$/i.test(file))) {
    throw new CliError(
      "Markdown import accepts only .md and .mdx files from the CLI.",
    );
  }
  const sources = await Promise.all(
    sourceFiles.map(async (file) => ({
      path:
        file.slice(absolute.length).replace(/^[/\\]/, "") ||
        file.split(/[\\/]/).at(-1) ||
        file,
      content: await readFile(file, "utf8"),
    })),
  );
  const [{ getStorageAdapterAsync }, markdownImport] = await Promise.all([
    import("../lib/storage/getStorageAdapter"),
    import("../lib/cms/markdown-import"),
  ]);
  const adapter = await getStorageAdapterAsync();
  const input = {
    collectionId,
    sources,
    mode: parsed.values["update-existing"]
      ? ("update" as const)
      : ("create" as const),
    addFields: [],
  };
  const report = parsed.values["dry-run"]
    ? await markdownImport.previewMarkdownImport(adapter, input)
    : await markdownImport.applyMarkdownImport(adapter, input, {
        id: "cli-markdown-import",
        username: "cli",
        email: "cli@aria.local",
      });
  print(JSON.stringify(report, null, 2));
}

type SeedLoaderSchemas = {
  AriaSeedPackageSchema: typeof import("../lib/cms/seed").AriaSeedPackageSchema;
  SeedManifestSchema: typeof import("../lib/export/cmsTypes").SeedManifestSchema;
  ExportedCollectionManifestSchema: typeof import("../lib/export/cmsTypes").ExportedCollectionManifestSchema;
  ExportedEntrySchema: typeof import("../lib/export/cmsTypes").ExportedEntrySchema;
};

async function listJsonFiles(directory: string): Promise<string[]> {
  const items = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    items.map(async (item) => {
      const itemPath = join(directory, item.name);
      if (item.isDirectory()) return listJsonFiles(itemPath);
      return item.isFile() && item.name.endsWith(".json") ? [itemPath] : [];
    }),
  );
  return nested.flat();
}

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function loadSeedInput(
  input: {
    path: string;
  } & SeedLoaderSchemas,
): Promise<unknown> {
  const raw = await loadJson(input.path);
  const direct = input.AriaSeedPackageSchema.safeParse(raw);
  if (direct.success) return direct.data;

  const manifest = input.SeedManifestSchema.parse(raw);
  const root = dirname(input.path);
  const collectionNames = manifest.collections.map((name) =>
    SeedManifestCollectionNameSchema.parse(name),
  );
  const applyOrder = manifest.applyOrder.map((name) =>
    SeedManifestCollectionNameSchema.parse(name),
  );
  const collectionNameSet = new Set(collectionNames);
  if (
    applyOrder.length !== collectionNameSet.size ||
    applyOrder.some((name) => !collectionNameSet.has(name))
  ) {
    throw new CliError(
      "Seed manifest applyOrder must contain every collection exactly once",
    );
  }

  const collections = await Promise.all(
    applyOrder.map(async (name) => {
      const manifestPath = join(root, "collections", `${name}.json`);
      const collection = input.ExportedCollectionManifestSchema.parse(
        await loadJson(manifestPath),
      );
      if (collection.name !== name) {
        throw new CliError(
          `Seed collection manifest name does not match its path: ${name}`,
        );
      }
      return {
        name: collection.name,
        label: collection.label,
        kind: collection.kind,
        ...(collection.schema.icon ? { icon: collection.schema.icon } : {}),
        fields: collection.schema.fields,
        ...(collection.schema.entryFieldOrder
          ? { entryFieldOrder: collection.schema.entryFieldOrder }
          : {}),
        ...(collection.schema.navigation
          ? { navigation: collection.schema.navigation }
          : {}),
        ...(collection.urlPattern ? { urlPattern: collection.urlPattern } : {}),
      };
    }),
  );

  const entries = (
    await Promise.all(
      applyOrder.map(async (name) => {
        const entryDirectory = join(root, "collections", name);
        const paths = await listJsonFiles(entryDirectory);
        return Promise.all(
          paths.map(async (entryPath) => ({
            collection: name,
            entry: input.ExportedEntrySchema.parse(await loadJson(entryPath)),
          })),
        );
      }),
    )
  ).flat();

  return input.AriaSeedPackageSchema.parse({
    version: 1,
    collections,
    entries,
  });
}

async function runSchemaCmsCommand(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    print(schemaHelp());
    return;
  }

  const parsed = parseArgs({
    args,
    options: {
      out: {
        type: "string",
        default: DEFAULT_SCHEMA_OUT,
      },
    },
  });

  const { generateCmsOpenApiJson } = await import("../lib/openapi/generate");
  const outPath = resolve(
    process.cwd(),
    parsed.values.out ?? DEFAULT_SCHEMA_OUT,
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, generateCmsOpenApiJson(), "utf8");
  print(`${aria("✓")} Wrote ${outPath}`);
}

function majorNodeVersion(): number {
  return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(resolve(process.cwd(), path), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runDoctorCommand(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    print(doctorHelp());
    return;
  }

  const packageJson = await readPackageJson();
  const checks: DoctorCheck[] = [];
  const requiredNode = packageJson.engines?.node ?? ">=22.18.0";

  checks.push({
    status: majorNodeVersion() >= 22 ? "pass" : "fail",
    label: `Node ${process.versions.node}`,
    detail: `Expected ${requiredNode}`,
  });

  checks.push({
    status: (await pathExists("package.json")) ? "pass" : "fail",
    label: "package.json",
    detail: "Run this command from an Aria project root.",
  });

  checks.push({
    status: (await pathExists("node_modules")) ? "pass" : "warn",
    label: "dependencies",
    detail: "Run npm install if dependencies are missing.",
  });

  checks.push({
    status: (await pathExists("astro.config.ts")) ? "pass" : "fail",
    label: "Astro config",
    detail: "Expected astro.config.ts.",
  });

  const hasWranglerJsonc = await pathExists("wrangler.jsonc");
  const hasWranglerJson = await pathExists("wrangler.json");
  const hasWranglerToml = await pathExists("wrangler.toml");
  checks.push({
    status:
      hasWranglerToml || hasWranglerJson || hasWranglerJsonc
        ? "pass"
        : "fail",
    label: "Wrangler config",
    detail: hasWranglerToml
      ? "Private wrangler.toml takes precedence over the committed wrangler.jsonc."
      : "Expected the committed wrangler.jsonc or a private wrangler.toml.",
  });

  checks.push({
    status: (await pathExists("aria/migrations")) ? "pass" : "fail",
    label: "D1 migrations",
    detail: "Expected aria/migrations.",
  });

  const hasDevVars = await pathExists(".dev.vars");
  const hasDevVarsExample = await pathExists(".dev.vars.example");
  checks.push({
    status: hasDevVars ? "pass" : hasDevVarsExample ? "warn" : "warn",
    label: "local env file",
    detail: hasDevVarsExample
      ? "Copy .dev.vars.example to .dev.vars for local secrets."
      : "Create .dev.vars if local secrets are needed.",
  });

  print(`${aria("◆ Aria doctor")}\n`);

  for (const check of checks) {
    const symbol =
      check.status === "pass" ? aria("✓") : check.status === "warn" ? "!" : "×";
    const suffix = check.status === "pass" ? "" : ` — ${check.detail ?? ""}`;
    print(`${symbol} ${check.label}${suffix}`);
  }

  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");

  if (failures.length > 0) {
    throw new CliError(
      `\n${failures.length} check${failures.length === 1 ? "" : "s"} failed.`,
    );
  }

  if (warnings.length > 0) {
    print(
      `\n${warnings.length} warning${warnings.length === 1 ? "" : "s"} found. Aria can run, but setup is not fully polished yet.`,
    );
    return;
  }

  print("\nEverything looks ready.");
}

async function route(
  command: string | undefined,
  args: string[],
): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    print(rootHelp());
    return;
  }

  if (command === "--version" || command === "-v") {
    print(await readVersion());
    return;
  }

  if (command === "doctor") {
    await runDoctorCommand(args);
    return;
  }

  if (command === "types") {
    await runTypesCommand(args);
    return;
  }

  if (command === "schema") {
    const [schemaName, ...rest] = args;
    if (!schemaName || hasHelpFlag(args)) {
      print(schemaHelp());
      return;
    }

    if (schemaName === "cms") {
      await runSchemaCmsCommand(rest);
      return;
    }

    throw new CliError(`Unknown schema "${schemaName}". Try aria schema cms.`);
  }

  if (command === "seed") {
    const [subcommand, ...rest] = args;
    if (!subcommand || hasHelpFlag(args)) {
      print(seedApplyHelp());
      return;
    }

    if (subcommand === "apply") {
      await runSeedApplyCommand(rest);
      return;
    }

    throw new CliError(
      `Unknown seed command "${subcommand}". Try aria seed apply.`,
    );
  }

  if (command === "import") {
    const [subcommand, ...rest] = args;
    if (!subcommand || hasHelpFlag(args)) {
      print(markdownImportHelp());
      return;
    }
    if (subcommand === "markdown") {
      await runMarkdownImportCommand(rest);
      return;
    }
    throw new CliError(
      `Unknown import command "${subcommand}". Try aria import markdown.`,
    );
  }

  // Backward-compatible internal alias. Prefer `aria schema cms`.
  if (command === "openapi" && args[0] === "cms") {
    await runSchemaCmsCommand(args.slice(1));
    return;
  }

  throw new CliError(`Unknown command "${command}". Run aria --help.`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  await route(command, args);
}

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    printError(error.message);
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  printError(message);

  if (
    process.env.ARIA_CLI_DEBUG === "1" &&
    error instanceof Error &&
    error.stack
  ) {
    printError(error.stack);
  } else {
    printError(`Run ${aria("ARIA_CLI_DEBUG=1")} for a full stack trace.`);
  }

  process.exit(1);
});

export const __ariaCliPath = fileURLToPath(import.meta.url);
