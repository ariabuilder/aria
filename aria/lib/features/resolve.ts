import { FEATURE_FLAG_DEFINITIONS } from "./flags";
import {
  FeatureFlagIdSchema,
  ResolvedFeatureFlagsSchema,
  type FeatureFlagId,
  type ResolvedFeatureFlags,
} from "./schemas";

export interface ResolveFeatureFlagsOptions {
  readonly overrides?: Partial<Record<FeatureFlagId, boolean>>;
  readonly env?: Readonly<Record<string, string | boolean | undefined>>;
}

function readEnvValue(
  env: Readonly<Record<string, string | boolean | undefined>> | undefined,
  envKey: string,
): string | undefined {
  if (!env) {
    return undefined;
  }

  const raw = env[envKey];
  if (typeof raw === "boolean") {
    return raw ? "true" : "false";
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

/**
 * Parse a feature-flag env override. Only explicit boolean tokens are accepted.
 * Invalid or empty values return `undefined` so callers fall back to defaults.
 */
export function parseFeatureFlagEnvValue(
  raw: string | undefined,
): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return undefined;
}

export function resolveFeatureFlags(
  options: ResolveFeatureFlagsOptions = {},
): ResolvedFeatureFlags {
  const resolved = {} as Record<FeatureFlagId, boolean>;

  for (const id of FeatureFlagIdSchema.options) {
    const definition = FEATURE_FLAG_DEFINITIONS[id];
    const override = options.overrides?.[id];
    if (override !== undefined) {
      resolved[id] = override;
      continue;
    }

    const envRaw = readEnvValue(options.env, definition.envKey);
    const envParsed = parseFeatureFlagEnvValue(envRaw);
    resolved[id] =
      envParsed !== undefined ? envParsed : definition.defaultEnabled;
  }

  return ResolvedFeatureFlagsSchema.parse(resolved);
}

let cachedFlags: ResolvedFeatureFlags | null = null;

function getDefaultEnv(): Readonly<Record<string, string | boolean | undefined>> {
  return import.meta.env;
}

export function getFeatureFlagSnapshot(): Readonly<ResolvedFeatureFlags> {
  if (!cachedFlags) {
    cachedFlags = resolveFeatureFlags({ env: getDefaultEnv() });
  }
  return cachedFlags;
}

export function isFeatureEnabled(id: FeatureFlagId): boolean {
  const parsedId = FeatureFlagIdSchema.parse(id);
  return getFeatureFlagSnapshot()[parsedId];
}

/** Clears the lazy cache — for Vitest only. */
export function resetFeatureFlagsForTests(): void {
  cachedFlags = null;
}

/** Seeds the lazy cache — for Vitest only. */
export function setFeatureFlagCacheForTests(flags: ResolvedFeatureFlags): void {
  cachedFlags = ResolvedFeatureFlagsSchema.parse(flags);
}
