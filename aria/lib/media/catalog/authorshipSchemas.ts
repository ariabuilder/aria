import { z } from "zod";

import { ActorRefSchema } from "../../auth/types";

/** Actor context for media catalog mutations. */
export const MediaAssetAuthorshipContextSchema = z
  .object({
    actor: ActorRefSchema,
    mutationKind: z
      .enum(["create", "update", "delete", "restore"])
      .optional(),
  })
  .strict();

export type MediaAssetAuthorshipContext = z.infer<
  typeof MediaAssetAuthorshipContextSchema
>;

export function parseMediaAssetAuthorshipContext(
  value: unknown,
): MediaAssetAuthorshipContext {
  return MediaAssetAuthorshipContextSchema.parse(value);
}
