import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type WranglerD1BindingConfig = {
  binding: string;
  databaseName: string;
  databaseId: string;
};

export type WranglerR2BindingConfig = {
  binding: string;
  bucketName: string;
};

/**
 * Active Wrangler config resolution, shared by Astro, the migration script,
 * and the deploy orchestrator.
 *
 * Precedence: a private, gitignored `wrangler.toml` (real account IDs) always
 * wins over the committed OSS `wrangler.jsonc` (placeholder IDs), so
 * maintainers' local resources are never shadowed by the committed template.
 */
export const WRANGLER_CONFIG_CANDIDATES = [
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
] as const;

/** Finds the first supported Wrangler configuration in a directory. */
export function resolveWranglerConfigPath(cwd = process.cwd()): string | null {
  const configuredPath = process.env.ARIA_WRANGLER_CONFIG?.trim();
  if (configuredPath) {
    const candidate = resolve(cwd, configuredPath);
    if (existsSync(candidate)) return candidate;
  }
  for (const filename of WRANGLER_CONFIG_CANDIDATES) {
    const candidate = resolve(cwd, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Reads the Worker name from a supported Wrangler configuration file. */
export function readWorkerNameFromWranglerConfig(
  configPath: string,
): string | null {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }
  if (configPath.endsWith(".toml")) {
    return raw.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  }
  return raw.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? null;
}

/** Reads a Wrangler TOML file from disk. */
export function readWranglerToml(
  configPath = resolve(process.cwd(), "wrangler.toml"),
): string {
  return readFileSync(configPath, "utf-8");
}

/** Parses a named D1 binding from Wrangler TOML. */
export function parseD1BindingFromWrangler(
  toml: string,
  bindingName = process.env.ARIA_D1_BINDING || "aria_db",
): WranglerD1BindingConfig {
  const blocks = [
    ...toml.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[\[|\n\[|$)/g),
  ];

  for (const block of blocks) {
    const section = block[1] ?? "";
    const binding = section.match(/binding\s*=\s*"([^"]+)"/)?.[1];
    if (binding !== bindingName) {
      continue;
    }

    const databaseName = section.match(/database_name\s*=\s*"([^"]+)"/)?.[1];
    const databaseId = section.match(/database_id\s*=\s*"([^"]+)"/)?.[1];

    if (!databaseName || !databaseId) {
      throw new Error(
        `D1 binding "${bindingName}" is missing database_name or database_id in wrangler.toml`,
      );
    }

    return {
      binding: bindingName,
      databaseName,
      databaseId,
    };
  }

  throw new Error(`D1 binding "${bindingName}" was not found in wrangler.toml`);
}

/** Parses a named R2 binding from Wrangler TOML. */
export function parseR2BindingFromWrangler(
  toml: string,
  bindingName = process.env.ARIA_R2_BINDING || "aria_r2",
): WranglerR2BindingConfig {
  const blocks = [
    ...toml.matchAll(/\[\[r2_buckets\]\]([\s\S]*?)(?=\n\[\[|\n\[|$)/g),
  ];

  for (const block of blocks) {
    const section = block[1] ?? "";
    const binding = section.match(/binding\s*=\s*"([^"]+)"/)?.[1];
    if (binding !== bindingName) {
      continue;
    }

    const bucketName = section.match(/bucket_name\s*=\s*"([^"]+)"/)?.[1];

    if (!bucketName) {
      throw new Error(
        `R2 binding "${bindingName}" is missing bucket_name in wrangler.toml`,
      );
    }

    return {
      binding: bindingName,
      bucketName,
    };
  }

  throw new Error(`R2 binding "${bindingName}" was not found in wrangler.toml`);
}

/** Returns the public R2 URL declared in a Wrangler TOML file. */
export function readR2PublicUrlFromWrangler(toml: string): string | undefined {
  const match = toml.match(/^\s*R2_PUBLIC_URL\s*=\s*"([^"]+)"/m);
  return match?.[1];
}

/** Locates the active local Wrangler D1 SQLite database, if one exists. */
export function resolveLocalWranglerD1SqlitePath(
  cwd = process.cwd(),
): string | null {
  const d1Dir = resolve(
    cwd,
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );

  let candidates: string[] = [];

  try {
    candidates = readdirSync(d1Dir)
      /** Keeps D1 database files rather than Wrangler metadata. */
      .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
      /** Resolves each database filename to its full state path. */
      .map((name) => resolve(d1Dir, name));
  } catch {
    return null;
  }

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  candidates.sort(
    /** Orders local D1 files from newest to oldest. */
    (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs,
  );

  return candidates[0]!;
}
