import { z } from "astro/zod";
import {
  isAriaLibraryMediaPath,
  normalizeLogicalMediaPath,
} from "../utils/path";
import { isLikelyMediaReference } from "./mediaReferenceKeys";

export const RefPathSegmentSchema = z.union([z.string().min(1), z.int().nonnegative()]);

export type RefPathSegment = z.infer<typeof RefPathSegmentSchema>;

export const ScrubMediaReferencesResultSchema = z
  .object({
    resource: z.unknown(),
    changed: z.boolean(),
    updatedCount: z.int().nonnegative(),
  })
  .strict();

export type ScrubMediaReferencesResult = z.infer<
  typeof ScrubMediaReferencesResultSchema
>;

const REF_PATH_TOKEN_PATTERN = /([^.\[\]]+)|\[(\d+)\]/g;

export function parseRefPath(refPath: string): RefPathSegment[] {
  const trimmed = refPath.trim();
  if (!trimmed || trimmed === "$root") {
    return [];
  }

  const segments: RefPathSegment[] = [];
  for (const match of trimmed.matchAll(REF_PATH_TOKEN_PATTERN)) {
    const property = match[1];
    const index = match[2];
    if (property !== undefined) {
      segments.push(property);
      continue;
    }
    if (index !== undefined) {
      segments.push(Number.parseInt(index, 10));
    }
  }

  return segments.map((segment) => RefPathSegmentSchema.parse(segment));
}

function cloneResource<T>(resource: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(resource);
  }
  return JSON.parse(JSON.stringify(resource)) as T;
}

function readParentValue(
  resource: unknown,
  segments: readonly RefPathSegment[],
): { parent: unknown; finalKey: RefPathSegment } | null {
  if (segments.length === 0) {
    return null;
  }

  let current: unknown = resource;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return null;
      }
      current = current[segment];
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  const finalKey = segments[segments.length - 1];
  if (finalKey === undefined) {
    return null;
  }

  return { parent: current, finalKey };
}

export function setValueAtRefPath(
  resource: unknown,
  refPath: string,
  value: string,
): { success: boolean; resource: unknown } {
  if (refPath.trim() === "$root") {
    return { success: true, resource: value };
  }

  const segments = parseRefPath(refPath);
  if (segments.length === 0) {
    return { success: false, resource };
  }

  const cloned = cloneResource(resource);
  const parentRef = readParentValue(cloned, segments);
  if (!parentRef) {
    return { success: false, resource };
  }

  const { parent, finalKey } = parentRef;
  if (typeof finalKey === "number") {
    if (!Array.isArray(parent)) {
      return { success: false, resource };
    }
    parent[finalKey] = value;
    return { success: true, resource: cloned };
  }

  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    return { success: false, resource };
  }

  (parent as Record<string, unknown>)[finalKey] = value;
  return { success: true, resource: cloned };
}

export function matchesLogicalMediaPath(
  rawUrl: string,
  logicalPath: string,
): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }

  let normalizedTarget: string;
  try {
    normalizedTarget = normalizeLogicalMediaPath(logicalPath);
  } catch {
    return false;
  }

  try {
    if (isAriaLibraryMediaPath(trimmed)) {
      return normalizeLogicalMediaPath(trimmed) === normalizedTarget;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const pathname = new URL(trimmed).pathname;
      if (!isAriaLibraryMediaPath(pathname) && !pathname.includes("/uploads/")) {
        return false;
      }
      return normalizeLogicalMediaPath(pathname) === normalizedTarget;
    }

    if (trimmed.includes("/uploads/") || trimmed.startsWith("uploads/")) {
      return normalizeLogicalMediaPath(trimmed) === normalizedTarget;
    }

    return false;
  } catch {
    return false;
  }
}

export function resolveMigratedMediaRawUrl(
  rawUrl: string,
  newLogicalPath: string,
): string {
  const trimmed = rawUrl.trim();
  const normalizedNew = normalizeLogicalMediaPath(newLogicalPath);

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    const pathname = url.pathname;
    if (isAriaLibraryMediaPath(pathname) || pathname.includes("/uploads/")) {
      url.pathname = normalizedNew;
      return url.toString();
    }
  }

  return normalizedNew;
}

function transformMediaReferencesInResource(
  resource: unknown,
  logicalPath: string,
  mode: "scrub" | "migrate",
  options: {
    fallback?: string;
    newLogicalPath?: string;
  },
): ScrubMediaReferencesResult {
  const cloned = cloneResource(resource);
  let updatedCount = 0;

  const visit = (
    value: unknown,
    parent: unknown,
    parentKey: string | number | null,
    keyName: string | null,
  ): void => {
    if (typeof value === "string") {
      if (!isLikelyMediaReference(value, keyName)) {
        return;
      }

      if (!matchesLogicalMediaPath(value, logicalPath)) {
        return;
      }

      const nextValue =
        mode === "scrub"
          ? (options.fallback ?? "")
          : resolveMigratedMediaRawUrl(
              value,
              options.newLogicalPath ?? logicalPath,
            );

      if (nextValue === value) {
        return;
      }

      if (parentKey === null || parent === null) {
        return;
      }

      if (typeof parentKey === "number") {
        if (!Array.isArray(parent)) {
          return;
        }
        parent[parentKey] = nextValue;
      } else if (typeof parent === "object" && !Array.isArray(parent)) {
        (parent as Record<string, unknown>)[parentKey] = nextValue;
      }

      updatedCount += 1;
      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], value, index, null);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        visit(child, value, key, key);
      }
    }
  };

  visit(cloned, null, null, null);

  return ScrubMediaReferencesResultSchema.parse({
    resource: cloned,
    changed: updatedCount > 0,
    updatedCount,
  });
}

export function scrubMediaReferencesFromResource(
  resource: unknown,
  logicalPath: string,
  fallback = "",
): ScrubMediaReferencesResult {
  return transformMediaReferencesInResource(resource, logicalPath, "scrub", {
    fallback,
  });
}

export function migrateMediaReferencesInResource(
  resource: unknown,
  oldLogicalPath: string,
  newLogicalPath: string,
): ScrubMediaReferencesResult {
  return transformMediaReferencesInResource(
    resource,
    oldLogicalPath,
    "migrate",
    { newLogicalPath },
  );
}

export function collectMediaReferenceLocations(
  resource: unknown,
): Array<{ refPath: string; rawUrl: string }> {
  const locations: Array<{ refPath: string; rawUrl: string }> = [];

  const visit = (
    value: unknown,
    refPath: string,
    parentKey: string | null,
  ): void => {
    if (typeof value === "string") {
      if (!isLikelyMediaReference(value, parentKey)) {
        return;
      }

      locations.push({
        refPath: refPath || "$root",
        rawUrl: value,
      });
      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], `${refPath}[${index}]`, null);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const childPath = refPath ? `${refPath}.${key}` : key;
        visit(child, childPath, key);
      }
    }
  };

  visit(resource, "", null);
  return locations;
}
