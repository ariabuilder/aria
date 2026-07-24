/**
 * Zod schemas for authorship read-model DTOs.
 */

import { z } from "zod";
import { ActorRefSchema, AssetAuthorshipSchema } from "../auth/types";
import { formatActorDisplayName } from "./reads";

/** Inventory/list summary — subset of AssetAuthorship plus display helper. */
export const PageInventoryAuthorshipSchema = AssetAuthorshipSchema.pick({
  createdBy: true,
  createdAt: true,
  updatedBy: true,
  updatedAt: true,
  publishedBy: true,
  publishedAt: true,
}).extend({
  lastEditorName: z.string().optional(),
});

export type PageInventoryAuthorship = z.infer<
  typeof PageInventoryAuthorshipSchema
>;

/** Per-version authorship row returned by storage getPageVersions. */
export const PageVersionAuthorshipEntrySchema = z
  .object({
    version: z.string().min(1),
    createdAt: z.string().min(1),
    createdBy: ActorRefSchema.optional(),
    activity: z
      .object({
        action: z.string(),
        userId: z.string(),
        userName: z.string(),
        target: z.string(),
      })
      .nullable()
      .optional(),
  })
  .strict();

export type PageVersionAuthorshipEntry = z.infer<
  typeof PageVersionAuthorshipEntrySchema
>;

export function parsePageInventoryAuthorship(
  value: unknown,
): PageInventoryAuthorship {
  return PageInventoryAuthorshipSchema.parse(value);
}

export function parsePageVersionAuthorshipEntry(
  value: unknown,
): PageVersionAuthorshipEntry {
  return PageVersionAuthorshipEntrySchema.parse(value);
}

/** Maps canonical envelope to list/inventory DTO with lastEditorName. */
export function toPageInventoryAuthorship(
  authorship: z.input<typeof AssetAuthorshipSchema>,
): PageInventoryAuthorship {
  const parsed = AssetAuthorshipSchema.parse(authorship);
  return PageInventoryAuthorshipSchema.parse({
    createdBy: parsed.createdBy,
    createdAt: parsed.createdAt,
    updatedBy: parsed.updatedBy,
    updatedAt: parsed.updatedAt,
    publishedBy: parsed.publishedBy,
    publishedAt: parsed.publishedAt,
    lastEditorName: parsed.updatedBy
      ? formatActorDisplayName(parsed.updatedBy)
      : undefined,
  });
}
