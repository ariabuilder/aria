/**
 * Authorship read helpers — SQL row parsing, legacy merge, DSL hydration.
 */

import {
  ActorRefSchema,
  AssetAuthorshipSchema,
  type ActorRef,
  type AssetAuthorship,
} from "../auth/types";
import type { PageDSL } from "../types/nodes";
import {
  DeriveAssetAuthorshipInputSchema,
  LegacyAuthorProjectionSchema,
  LegacyContributorProjectionSchema,
  VersionRowAuthorshipSliceSchema,
  deriveAssetAuthorship,
  fromLegacyAuthorProjection,
  toLegacyAuthorProjection,
  type DeriveAssetAuthorshipInput,
  type VersionRowAuthorshipSlice,
} from "./projections";
import { z } from "zod";

/** SQL row shape for version authorship columns. */
export const VersionAuthorshipRowSchema = z
  .object({
    version: z.string().min(1),
    created_at: z.string().min(1),
    created_by_id: z.string().nullable().optional(),
    created_by_username: z.string().nullable().optional(),
    created_by_email: z.string().nullable().optional(),
    created_by_avatar_url: z.string().nullable().optional(),
  })
  .strict();

export type VersionAuthorshipRow = z.infer<typeof VersionAuthorshipRowSchema>;

/** Legacy DSL authorship fields used as read fallback (tier 3). */
export const LegacyDslAuthorshipFieldsSchema = z
  .object({
    author: LegacyAuthorProjectionSchema.optional(),
    contributors: z.array(LegacyContributorProjectionSchema).optional(),
    reviewStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    assignedTo: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    publishedAt: z.string().optional(),
  })
  .strict();

export type LegacyDslAuthorshipFields = z.infer<
  typeof LegacyDslAuthorshipFieldsSchema
>;

export function formatActorDisplayName(actor: ActorRef): string {
  const parsed = ActorRefSchema.parse(actor);
  return parsed.username?.trim() || parsed.id;
}

export function parseActorFromSqlColumns(columns: {
  id: string | null | undefined;
  username: string | null | undefined;
  email: string | null | undefined;
  avatarUrl: string | null | undefined;
}): ActorRef | undefined {
  if (typeof columns.id !== "string" || columns.id.trim().length === 0) {
    return undefined;
  }
  return ActorRefSchema.parse({
    id: columns.id,
    username:
      typeof columns.username === "string" && columns.username.trim().length > 0
        ? columns.username
        : undefined,
    email:
      typeof columns.email === "string" && columns.email.trim().length > 0
        ? columns.email
        : undefined,
    avatarUrl:
      typeof columns.avatarUrl === "string" &&
      columns.avatarUrl.trim().length > 0
        ? columns.avatarUrl
        : undefined,
  });
}

export function parseVersionAuthorshipRow(
  row: unknown,
): VersionRowAuthorshipSlice {
  const parsed = VersionAuthorshipRowSchema.parse(row);
  const actor = parseActorFromSqlColumns({
    id: parsed.created_by_id,
    username: parsed.created_by_username,
    email: parsed.created_by_email,
    avatarUrl: parsed.created_by_avatar_url,
  });
  return VersionRowAuthorshipSliceSchema.parse({
    version: parsed.version,
    createdAt: parsed.created_at,
    createdBy: actor,
  });
}

export function buildDeriveAssetAuthorshipInput(input: {
  currentVersion?: string | null;
  draftVersion?: string | null;
  publishedVersion?: string | null;
  versionRows: readonly unknown[];
}): DeriveAssetAuthorshipInput {
  const versions = input.versionRows.map((row) =>
    parseVersionAuthorshipRow(row),
  );

  return DeriveAssetAuthorshipInputSchema.parse({
    currentVersion: input.currentVersion ?? undefined,
    draftVersion: input.draftVersion ?? undefined,
    publishedVersion: input.publishedVersion ?? undefined,
    versions,
  });
}

export function parseLegacyDslAuthorshipFields(
  page: PageDSL,
): LegacyDslAuthorshipFields {
  return LegacyDslAuthorshipFieldsSchema.parse({
    author: page.author,
    contributors: page.contributors,
    reviewStatus: page.reviewStatus,
    assignedTo: page.assignedTo,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    publishedAt: page.publishedAt,
  });
}

/**
 * Fills gaps in canonical authorship from legacy DSL fields (precedence tier 3).
 */
export function mergeAuthorshipWithLegacyDsl(
  canonical: AssetAuthorship,
  legacy: LegacyDslAuthorshipFields,
): AssetAuthorship {
  const parsedCanonical = AssetAuthorshipSchema.parse(canonical);
  const parsedLegacy = LegacyDslAuthorshipFieldsSchema.parse(legacy);

  const legacyAuthor = parsedLegacy.author
    ? fromLegacyAuthorProjection(parsedLegacy.author)
    : undefined;

  const legacyContributors = parsedLegacy.contributors?.map((entry) =>
    LegacyContributorProjectionSchema.parse(entry),
  );

  return AssetAuthorshipSchema.parse({
    createdBy: parsedCanonical.createdBy ?? legacyAuthor,
    createdAt: parsedCanonical.createdAt ?? parsedLegacy.createdAt,
    updatedBy: parsedCanonical.updatedBy,
    updatedAt: parsedCanonical.updatedAt ?? parsedLegacy.updatedAt,
    publishedBy: parsedCanonical.publishedBy,
    publishedAt: parsedCanonical.publishedAt ?? parsedLegacy.publishedAt,
    reviewedBy: parsedCanonical.reviewedBy,
    reviewedAt: parsedCanonical.reviewedAt,
    assignedTo: parsedCanonical.assignedTo ?? parsedLegacy.assignedTo,
    contributors:
      parsedCanonical.contributors ??
      legacyContributors?.map((entry) => ({
        actor: ActorRefSchema.parse({ id: entry.id }),
        role: entry.role,
      })),
  });
}

/** Hydrates legacy DSL projection fields from canonical authorship (read-only). */
export function hydratePageDslAuthorship(
  page: PageDSL,
  authorship: AssetAuthorship,
): PageDSL {
  const parsed = AssetAuthorshipSchema.parse(authorship);
  const hydrated: PageDSL = { ...page };

  if (parsed.updatedBy) {
    hydrated.author = toLegacyAuthorProjection(parsed.updatedBy);
  } else if (parsed.createdBy) {
    hydrated.author = toLegacyAuthorProjection(parsed.createdBy);
  }

  if (parsed.updatedAt) {
    hydrated.updatedAt = parsed.updatedAt;
  }
  if (parsed.createdAt) {
    hydrated.createdAt = parsed.createdAt;
  }
  if (parsed.publishedAt) {
    hydrated.publishedAt = parsed.publishedAt;
  }

  return hydrated;
}

/** Derives canonical authorship and merges legacy DSL fallback when provided. */
export function resolvePageAuthorship(
  deriveInput: DeriveAssetAuthorshipInput,
  legacy?: LegacyDslAuthorshipFields,
): AssetAuthorship {
  const canonical = deriveAssetAuthorship(deriveInput);
  if (!legacy) {
    return AssetAuthorshipSchema.parse(canonical);
  }
  return mergeAuthorshipWithLegacyDsl(canonical, legacy);
}
