/**
 * Legacy DSL authorship projections and read-model signatures.
 */

import { z } from "zod";
import {
  ActorRefSchema,
  AssetAuthorshipSchema,
  type ActorRef,
  type AssetAuthorship,
} from "../auth/types";

const PROJECTION_NOTE =
  "Compatibility projection; canonical authorship is derived from version rows or asset-row columns for singletons." as const;

/** Legacy PageDSL / LayoutDSL / ComponentDSL author shape inside dsl_json. */
export const LegacyAuthorProjectionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    email: z.email().optional(),
  })
  .strict()
  .describe(PROJECTION_NOTE);

export type LegacyAuthorProjection = z.infer<
  typeof LegacyAuthorProjectionSchema
>;

export const LegacyContributorProjectionSchema = z
  .object({
    id: z.string().min(1),
    role: z.string().optional(),
  })
  .strict()
  .describe(PROJECTION_NOTE);

export type LegacyContributorProjection = z.infer<
  typeof LegacyContributorProjectionSchema
>;

/** Input for deriveAssetAuthorship — meta pointers + version rows with authorship. */
export const VersionRowAuthorshipSliceSchema = z
  .object({
    version: z.string().min(1),
    createdAt: z.string().min(1),
    createdBy: ActorRefSchema.optional(),
  })
  .strict();

export type VersionRowAuthorshipSlice = z.infer<
  typeof VersionRowAuthorshipSliceSchema
>;

export const DeriveAssetAuthorshipInputSchema = z
  .object({
    currentVersion: z.string().optional(),
    draftVersion: z.string().optional(),
    publishedVersion: z.string().optional(),
    versions: z.array(VersionRowAuthorshipSliceSchema),
  })
  .strict();

export type DeriveAssetAuthorshipInput = z.infer<
  typeof DeriveAssetAuthorshipInputSchema
>;

/**
 * Maps canonical ActorRef to legacy DSL `author` projection (read hydration / UI).
 */
export function toLegacyAuthorProjection(
  actor: ActorRef,
): LegacyAuthorProjection {
  const parsedActor = ActorRefSchema.parse(actor);
  return LegacyAuthorProjectionSchema.parse({
    id: parsedActor.id,
    name: parsedActor.username,
    email: parsedActor.email,
  });
}

/**
 * Maps legacy DSL `author` to canonical ActorRef (import / transition reads only).
 */
export function fromLegacyAuthorProjection(
  author: LegacyAuthorProjection,
): ActorRef {
  const parsed = LegacyAuthorProjectionSchema.parse(author);
  return ActorRefSchema.parse({
    id: parsed.id,
    username: parsed.name,
    email: parsed.email,
  });
}

/**
 * Derives current-state AssetAuthorship from version chain via meta pointers.
 */
export function deriveAssetAuthorship(
  input: DeriveAssetAuthorshipInput,
): AssetAuthorship {
  const parsed = DeriveAssetAuthorshipInputSchema.parse(input);
  const versions = parsed.versions;

  if (versions.length === 0) {
    return AssetAuthorshipSchema.parse({});
  }

  const byVersion = new Map(versions.map((slice) => [slice.version, slice]));

  const earliest = [...versions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )[0];

  const latest = [...versions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];

  const currentSlice =
    (parsed.currentVersion ? byVersion.get(parsed.currentVersion) : undefined) ??
    latest;

  const publishedSlice = parsed.publishedVersion
    ? byVersion.get(parsed.publishedVersion)
    : undefined;

  return AssetAuthorshipSchema.parse({
    createdBy: earliest?.createdBy,
    createdAt: earliest?.createdAt,
    updatedBy: currentSlice?.createdBy,
    updatedAt: currentSlice?.createdAt,
    publishedBy: publishedSlice?.createdBy,
    publishedAt: publishedSlice?.createdAt,
  });
}

/** Validates a derived authorship envelope at API boundaries. */
export function parseAssetAuthorship(value: unknown): AssetAuthorship {
  return AssetAuthorshipSchema.parse(value);
}
