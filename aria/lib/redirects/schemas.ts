import { z } from "zod";

export const RedirectStatusCodeSchema = z.union([
  z.literal(301),
  z.literal(302),
]);
export type RedirectStatusCode = z.infer<typeof RedirectStatusCodeSchema>;

export const RedirectRuleSchema = z
  .object({
    id: z.string().min(1),
    fromPath: z.string().min(1),
    toPath: z.string().min(1),
    statusCode: RedirectStatusCodeSchema,
    enabled: z.boolean(),
    note: z.string().max(512).optional(),
    createdAt: z.string().min(1),
    createdById: z.string().optional(),
    updatedAt: z.string().min(1),
  })
  .strict();

export type RedirectRule = z.infer<typeof RedirectRuleSchema>;

export function parseRedirectRule(input: unknown): RedirectRule {
  return RedirectRuleSchema.parse(input);
}

export const CreateRedirectInputSchema = z
  .object({
    fromPath: z.string().min(1),
    toPath: z.string().min(1),
    statusCode: RedirectStatusCodeSchema.default(301),
    enabled: z.boolean().default(true),
    note: z.string().max(512).optional(),
  })
  .strict();

export type CreateRedirectInput = z.infer<typeof CreateRedirectInputSchema>;

export const UpdateRedirectInputSchema = z
  .object({
    id: z.string().min(1),
    fromPath: z.string().min(1).optional(),
    toPath: z.string().min(1).optional(),
    statusCode: RedirectStatusCodeSchema.optional(),
    enabled: z.boolean().optional(),
    note: z.string().max(512).nullable().optional(),
  })
  .strict();

export type UpdateRedirectInput = z.infer<typeof UpdateRedirectInputSchema>;

export const DeleteRedirectInputSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export type DeleteRedirectInput = z.infer<typeof DeleteRedirectInputSchema>;

export const FlattenRedirectChainInputSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export type FlattenRedirectChainInput = z.infer<
  typeof FlattenRedirectChainInputSchema
>;

export const ListRedirectsInputSchema = z
  .object({
    includeDisabled: z.boolean().optional(),
  })
  .strict();

export type ListRedirectsInput = z.infer<typeof ListRedirectsInputSchema>;

export const ListRedirectsResponseSchema = z
  .object({
    redirects: z.array(RedirectRuleSchema),
  })
  .strict();

export type ListRedirectsResponse = z.infer<typeof ListRedirectsResponseSchema>;

export const RedirectTargetKindSchema = z.enum(["page", "entry"]);
export type RedirectTargetKind = z.infer<typeof RedirectTargetKindSchema>;

export const RedirectTargetSchema = z
  .object({
    id: z.string().min(1),
    kind: RedirectTargetKindSchema,
    title: z.string().min(1),
    path: z.string().min(1),
    status: z.string().optional(),
    collectionId: z.string().min(1).optional(),
    collectionLabel: z.string().min(1).optional(),
    locale: z.string().min(1).optional(),
  })
  .strict();

export type RedirectTarget = z.infer<typeof RedirectTargetSchema>;

export const ListRedirectTargetsResponseSchema = z
  .object({
    targets: z.array(RedirectTargetSchema),
  })
  .strict();

export type ListRedirectTargetsResponse = z.infer<
  typeof ListRedirectTargetsResponseSchema
>;

export const ImportRedirectsCsvInputSchema = z
  .object({
    csv: z.string().min(1).max(512_000),
    replaceExisting: z.boolean().default(false),
  })
  .strict();

export type ImportRedirectsCsvInput = z.infer<
  typeof ImportRedirectsCsvInputSchema
>;

export const ImportRedirectsCsvResponseSchema = z
  .object({
    imported: z.int().nonnegative(),
    skipped: z.int().nonnegative(),
    errors: z.array(z.string()),
  })
  .strict();

export type ImportRedirectsCsvResponse = z.infer<
  typeof ImportRedirectsCsvResponseSchema
>;
