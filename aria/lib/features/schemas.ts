import { z } from "zod";

export const FeatureFlagIdSchema = z.enum(["studio.layouts", "studio.agent"]);

export type FeatureFlagId = z.infer<typeof FeatureFlagIdSchema>;

export const FeatureFlagDefinitionSchema = z
  .object({
    defaultEnabled: z.boolean(),
    description: z.string().trim().min(1),
    envKey: z.string().trim().min(1),
  })
  .strict();

export type FeatureFlagDefinition = z.infer<typeof FeatureFlagDefinitionSchema>;

export const FeatureFlagRegistrySchema = z.record(
  FeatureFlagIdSchema,
  FeatureFlagDefinitionSchema,
);

export type FeatureFlagRegistry = z.infer<typeof FeatureFlagRegistrySchema>;

export const FeatureFlagEnvValueSchema = z.enum([
  "true",
  "false",
  "1",
  "0",
  "TRUE",
  "FALSE",
  "True",
  "False",
]);

export const ComposerItemTypeSchema = z.enum(["page", "layout", "component"]);

export type ComposerItemType = z.infer<typeof ComposerItemTypeSchema>;

export const ResolvedFeatureFlagsSchema = z.record(
  FeatureFlagIdSchema,
  z.boolean(),
);

export type ResolvedFeatureFlags = z.infer<typeof ResolvedFeatureFlagsSchema>;
