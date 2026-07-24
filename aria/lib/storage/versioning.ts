import { z } from "zod";
import { VersionAuthorshipSchema } from "../auth/types";

export const DEFAULT_RECENT_VERSION_LIMIT = 5;
export const DEFAULT_TRANSIENT_VERSION_KEYS = [
  "version",
  "updatedAt",
  "createdAt",
  "publishedAt",
  "author",
  "_computedMetrics",
  "isModifiedSincePublish",
] as const;

export const ContentHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "Expected a lowercase SHA-256 hex digest");

export type ContentHash = z.infer<typeof ContentHashSchema>;

export const VersionSaveOptionsSchema = z
  .object({
    /** Reject the save when the persisted current version differs. */
    expectedVersion: z.string().trim().min(1).optional(),
    preserveVersion: z.boolean().optional(),
    /** When a version row exists with different content, update it instead of throwing. */
    overwriteVersionIfExists: z.boolean().optional(),
    skipIfContentUnchanged: z.boolean().optional(),
    versionHint: z.string().trim().min(1).optional(),
    /**
     * Human-readable activity JSON for version timeline / activity feed.
     * Stored on `aria_page_versions.activity_metadata`.
     */
    activityMetadata: z.string().optional(),
    /**
     * Structured actor snapshot for the new version row.
     */
    versionAuthorship: VersionAuthorshipSchema.optional(),
  })
  .strict();

export type VersionSaveOptions = z.infer<typeof VersionSaveOptionsSchema>;

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";

  constructor(expectedVersion: string, currentVersion: string | null) {
    super(
      `Version conflict: expected ${expectedVersion}, found ${currentVersion ?? "no current version"}`,
    );
    this.name = "VersionConflictError";
  }
}

let lastAllocatedVersionMs = 0;
let sameMillisecondVersionSequence = 0;

/**
 * Monotonic version id for draft saves. Collisions on
 * (id, version) occurred when multiple mutations used Date.
 */
export function allocateVersionId(): string {
  const now = Date.now();
  if (now === lastAllocatedVersionMs) {
    sameMillisecondVersionSequence += 1;
    return `${now}-${sameMillisecondVersionSequence}`;
  }

  lastAllocatedVersionMs = now;
  sameMillisecondVersionSequence = 0;
  return String(now);
}

export function isStorageVersionConflictError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);

  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("version conflict") ||
    message.includes("SQLITE_CONSTRAINT")
  );
}

export const StoredVersionRecordSchema = z
  .object({
    version: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    contentHash: ContentHashSchema.optional(),
  })
  .strict();

export type StoredVersionRecord = z.infer<typeof StoredVersionRecordSchema>;

export const VersionRetentionPolicySchema = z
  .object({
    keepLatest: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_RECENT_VERSION_LIMIT),
    pinnedVersions: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export type VersionRetentionPolicy = z.infer<
  typeof VersionRetentionPolicySchema
>;

export const VersionRetentionSelectionSchema = z
  .object({
    keepVersions: z.array(z.string().trim().min(1)),
    deleteVersions: z.array(z.string().trim().min(1)),
  })
  .strict();

export type VersionRetentionSelection = z.infer<
  typeof VersionRetentionSelectionSchema
>;

export const VersionHistoryResourceTypeSchema = z.enum([
  "page",
  "layout",
  "component",
]);

export type VersionHistoryResourceType = z.infer<
  typeof VersionHistoryResourceTypeSchema
>;

export const VersionHistoryPruneRequestSchema = z
  .object({
    resourceType: VersionHistoryResourceTypeSchema,
    resourceId: z.string().trim().min(1),
    keepLatest: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_RECENT_VERSION_LIMIT),
    dryRun: z.boolean().default(false),
  })
  .strict();

export type VersionHistoryPruneRequest = z.infer<
  typeof VersionHistoryPruneRequestSchema
>;

export const VersionHistoryPruneResultSchema = z
  .object({
    resourceType: VersionHistoryResourceTypeSchema,
    resourceId: z.string().trim().min(1),
    keepLatest: z.int().min(1).max(100),
    dryRun: z.boolean(),
    keptVersions: z.array(z.string().trim().min(1)),
    deletedVersions: z.array(z.string().trim().min(1)),
  })
  .strict();

export type VersionHistoryPruneResult = z.infer<
  typeof VersionHistoryPruneResultSchema
>;

type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

function normalizeStableJsonValue(value: unknown): StableJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeStableJsonValue(entry));
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, normalizeStableJsonValue(entryValue)]);

    return Object.fromEntries(normalizedEntries);
  }

  return String(value);
}

export function buildVersionHashPayload(
  value: unknown,
  transientTopLevelKeys: readonly string[] = DEFAULT_TRANSIENT_VERSION_KEYS,
): string {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };

  const normalizedTopLevel = Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !transientTopLevelKeys.includes(key),
    ),
  );

  return JSON.stringify(normalizeStableJsonValue(normalizedTopLevel));
}

export async function computeVersionContentHash(
  value: unknown,
  transientTopLevelKeys: readonly string[] = DEFAULT_TRANSIENT_VERSION_KEYS,
): Promise<ContentHash> {
  const payload = buildVersionHashPayload(value, transientTopLevelKeys);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return ContentHashSchema.parse(hash);
}

export function selectRetainedVersions(input: {
  versions: readonly StoredVersionRecord[];
  policy?: VersionRetentionPolicy;
}): VersionRetentionSelection {
  const parsedPolicy = VersionRetentionPolicySchema.parse(input.policy ?? {});
  const parsedVersions = input.versions.map((version) =>
    StoredVersionRecordSchema.parse(version),
  );
  const pinnedVersions = new Set(parsedPolicy.pinnedVersions);
  const sortedVersions = [...parsedVersions].sort((left, right) =>
    right.version.localeCompare(left.version),
  );
  const keepVersions = new Set<string>();

  for (const version of sortedVersions.slice(0, parsedPolicy.keepLatest)) {
    keepVersions.add(version.version);
  }

  for (const version of pinnedVersions) {
    keepVersions.add(version);
  }

  return VersionRetentionSelectionSchema.parse({
    keepVersions: sortedVersions
      .map((version) => version.version)
      .filter((version) => keepVersions.has(version)),
    deleteVersions: sortedVersions
      .map((version) => version.version)
      .filter((version) => !keepVersions.has(version)),
  });
}
