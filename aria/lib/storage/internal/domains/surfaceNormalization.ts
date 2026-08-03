import {
  normalizeEditableSurface,
  type NormalizedRenderSurface,
  type RenderSurfaceKind,
} from "../../../rendering/canonical";
import { log } from "../../../utils/logger";

type PreparedSurfaceEntry = {
  kind: RenderSurfaceKind;
  normalized: NormalizedRenderSurface;
};

/**
 * One-use handoff for callers that validate a complete proposal before entering
 * storage. The WeakMap keeps the optimization process-local and impossible to
 * serialize across an action boundary; storage still normalizes every value
 * that was not produced by this module in the current isolate.
 */
const preparedSurfaces = new WeakMap<object, PreparedSurfaceEntry>();

export async function prepareSurfaceForPersistence<K extends RenderSurfaceKind>(
  kind: K,
  source: unknown,
): Promise<NormalizedRenderSurface<K>> {
  const normalized = await normalizeEditableSurface(
    { kind, source },
    { freeze: true },
  );
  preparedSurfaces.set(normalized.source as object, {
    kind,
    normalized,
  });
  return normalized;
}

/**
 * Storage-side entry point for the portable normalizer.
 */
export async function normalizeSurfaceForPersistence<
  K extends RenderSurfaceKind,
>(kind: K, source: unknown): Promise<NormalizedRenderSurface<K>> {
  if (typeof source === "object" && source !== null) {
    const prepared = preparedSurfaces.get(source);
    if (prepared?.kind === kind) {
      preparedSurfaces.delete(source);
      return prepared.normalized as NormalizedRenderSurface<K>;
    }
  }
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
    const contentHash = input.row.content_hash ?? input.row.contentHash;
    const compilerMetadata =
      input.row.compiler_metadata_json ?? input.row.compilerMetadataJson;
    if (
      typeof contentHash === "string" &&
      /^[a-f0-9]{64}$/u.test(contentHash) &&
      hasCanonicalSourceHashMarker(compilerMetadata)
    ) {
      return contentHash;
    }

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

function hasCanonicalSourceHashMarker(value: unknown): boolean {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "renderSourceHashVersion" in parsed &&
      (parsed as { renderSourceHashVersion?: unknown })
        .renderSourceHashVersion === 1
    );
  } catch {
    return false;
  }
}
