import {
  normalizeEditableSurface,
  type NormalizedRenderSurface,
  type RenderSurfaceKind,
} from "../../../rendering/canonical";
import { log } from "../../../utils/logger";

/**
 * Storage-side entry point for the portable normalizer.
 */
export async function normalizeSurfaceForPersistence<
  K extends RenderSurfaceKind,
>(kind: K, source: unknown): Promise<NormalizedRenderSurface<K>> {
  return normalizeEditableSurface({ kind, source });
}

/**
 * Prepares one complete version-table payload for trusted/direct writers.
 * The system-owned fields are deliberately added after source hashing.
 */
export async function prepareNormalizedSurfaceVersion<
  K extends RenderSurfaceKind,
>(input: {
  kind: K;
  source: unknown;
  version: string;
  updatedAt: string;
}): Promise<{
  source: NormalizedRenderSurface<K>["source"] & {
    version: string;
    updatedAt: string;
  };
  sourceHash: NormalizedRenderSurface<K>["sourceHash"];
}> {
  const normalized = await normalizeSurfaceForPersistence(
    input.kind,
    input.source,
  );
  return {
    source: {
      ...normalized.source,
      version: input.version,
      updatedAt: input.updatedAt,
    },
    sourceHash: normalized.sourceHash,
  };
}

export async function resolveStoredSemanticSourceHash(input: {
  kind: RenderSurfaceKind;
  row: Record<string, unknown>;
  fallback: () => Promise<string>;
}): Promise<string> {
  try {
    const dslJson = input.row.dsl_json ?? input.row.dslJson;
    if (typeof dslJson !== "string") {
      return input.fallback();
    }
    const normalized = await normalizeSurfaceForPersistence(
      input.kind,
      JSON.parse(dslJson),
    );
    return normalized.sourceHash;
  } catch (error) {
    log("warn", "Stored semantic source hash normalization failed", {
      kind: input.kind,
      id: typeof input.row.id === "string" ? input.row.id : undefined,
      version:
        typeof input.row.version === "string" ? input.row.version : undefined,
      error,
    });
    return input.fallback();
  }
}
