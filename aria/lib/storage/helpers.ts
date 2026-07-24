import { z } from "zod";
import type {
  StoredPageAccessMode,
  StoredPagePolicy,
  StoredPagePolicySummary,
} from "./adapter";
import type { PageDSL } from "../types/nodes";
import { normalizeMediaKey } from "../media/utils/key";
import { isHiddenMediaPath } from "../media/utils/visibility";

const StoredPagePolicyRowSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().nullable(),
    system_role: z.string(),
    access_mode: z.string(),
    access_password_hash: z.string().nullable(),
    access_prompt_title: z.string().nullable(),
    access_prompt_description: z.string().nullable(),
    access_remember_for_days: z.coerce.number().int().min(1).max(30).nullable(),
    access_policy_version: z.coerce.number().int().positive(),
    published_version: z.string().nullable(),
    updated_at: z.string().trim().min(1),
  })
  .strict();

const StoredPagePolicySummaryRowSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().nullable(),
    system_role: z.string(),
    access_mode: z.string(),
    access_password_hash: z.string().nullable(),
  })
  .strict();

type StorageSchema<T> = {
  parse(value: unknown): T;
};

export interface StorageMediaMetadata {
  contentType?: string;
  alt?: string;
  [key: string]: unknown;
}

export function toStoredPagePolicy(
  row: unknown,
  schema: StorageSchema<StoredPagePolicy>,
): StoredPagePolicy {
  const parsed = StoredPagePolicyRowSchema.parse(row);

  return schema.parse({
    id: parsed.id,
    slug: parsed.slug ?? parsed.id,
    systemRole: parsed.system_role,
    accessMode: parsed.access_mode,
    accessPasswordHash: parsed.access_password_hash,
    accessPromptTitle: parsed.access_prompt_title,
    accessPromptDescription: parsed.access_prompt_description,
    accessRememberForDays: parsed.access_remember_for_days,
    accessPolicyVersion: parsed.access_policy_version,
    publishedVersion:
      parsed.published_version && parsed.published_version.trim().length > 0
        ? parsed.published_version
        : null,
    updatedAt: parsed.updated_at,
  });
}

export function toStoredPagePolicySummary(
  row: unknown,
  schema: StorageSchema<StoredPagePolicySummary>,
): StoredPagePolicySummary {
  const parsed = StoredPagePolicySummaryRowSchema.parse(row);

  return schema.parse({
    id: parsed.id,
    slug: parsed.slug ?? parsed.id,
    systemRole: parsed.system_role,
    accessMode: parsed.access_mode,
    hasPassword:
      typeof parsed.access_password_hash === "string" &&
      parsed.access_password_hash.trim().length > 0,
  });
}

export function deriveLegacyPageAccessMode(
  visibility: PageDSL["visibility"] | undefined,
): StoredPageAccessMode {
  switch (visibility) {
    case "private":
      return "private";
    case "unlisted":
      return "unlisted";
    default:
      return "public";
  }
}

export function parseFeaturedImage(
  raw: string | null,
): { src: string; alt?: string; caption?: string } | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "src" in parsed &&
      typeof (parsed as Record<string, unknown>).src === "string"
    ) {
      const obj = parsed as Record<string, unknown>;
      return {
        src: obj.src as string,
        alt: typeof obj.alt === "string" ? obj.alt : undefined,
        caption: typeof obj.caption === "string" ? obj.caption : undefined,
      };
    }
  } catch {
    // Ignore malformed featured image JSON stored in older page DSL rows.
  }
  return undefined;
}

export function serializeDslForStorage(dsl: unknown): string {
  return JSON.stringify(dsl);
}

export function prepareMediaBufferSave(
  filepath: string,
  metadata?: StorageMediaMetadata,
): {
  normalizedPath: string;
  metadata?: StorageMediaMetadata;
  contentType?: string;
  customMetadata?: Record<string, string>;
} {
  if (isHiddenMediaPath(filepath)) {
    throw new Error("Hidden media paths are not allowed");
  }

  return {
    normalizedPath: normalizeMediaKey(filepath),
    metadata,
    contentType: metadata?.contentType,
    customMetadata: metadata
      ? Object.fromEntries(
          Object.entries(metadata)
            .filter(([key]) => key !== "contentType")
            .map(([key, value]) => [key, String(value)]),
        )
      : undefined,
  };
}
