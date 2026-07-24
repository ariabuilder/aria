import { z } from "zod";
import {
  BodyGlobalStyleSchema,
  HeadingGlobalStyleSchema,
  LinkGlobalStyleSchema,
  ButtonGlobalStyleSchema,
  InputGlobalStyleSchema,
  GlobalStyleVariableDefinitionSchema,
  GlobalStyleVariableAliasSchema,
  CssCustomPropertyKeySchema,
} from "../../../../../../lib/styles/universalDesignSystem";

/**
 * Partial update for a single element type's default styles.
 * Mirrors SectionGlobalStyleSchema from aria/lib — all fields optional.
 */
export const SectionGlobalStylePatchSchema = z
  .object({
    contentMaxWidth: z.string().optional(),
    horizontalPadding: z.string().optional(),
    verticalPadding: z.string().optional(),
    sectionGap: z.string().optional(),
  })
  .strict();

export type SectionGlobalStylePatch = z.infer<
  typeof SectionGlobalStylePatchSchema
>;

/**
 * Partial update for global styles. Matches the REAL
 * GlobalStylesConfig shape: { defaults: { body, heading,..
 */
export const GlobalStylesPatchSchema = z
  .object({
    defaults: z
      .object({
        body: BodyGlobalStyleSchema.partial().optional(),
        heading: HeadingGlobalStyleSchema.partial().optional(),
        link: LinkGlobalStyleSchema.partial().optional(),
        button: ButtonGlobalStyleSchema.partial().optional(),
        input: InputGlobalStyleSchema.partial().optional(),
        section: SectionGlobalStylePatchSchema.optional(),
      })
      .optional(),
    variables: z
      .object({
        custom: z
          .record(
            CssCustomPropertyKeySchema,
            GlobalStyleVariableDefinitionSchema.partial(),
          )
          .optional(),
        aliases: z
          .record(
            CssCustomPropertyKeySchema,
            GlobalStyleVariableAliasSchema.partial(),
          )
          .optional(),
      })
      .optional(),
  })
  .strict();

export type GlobalStylesPatch = z.infer<typeof GlobalStylesPatchSchema>;

export const PlanBlockStylesInputSchema = z
  .object({
    className: z.string().min(1).max(128),
    breakpoint: z.string().optional(),
    rules: z
      .record(z.string(), z.string())
      .refine(
        (r) => Object.keys(r).length > 0,
        "At least one CSS rule is required",
      ),
  })
  .strict();
export type PlanBlockStylesInput = z.infer<typeof PlanBlockStylesInputSchema>;

export const PlanBlockStylesOutputSchema = z
  .object({
    plan: z.object({
      className: z.string(),
      needsCreate: z.boolean(),
      conflicts: z.array(
        z.object({
          existingRule: z.string(),
          proposedRule: z.string(),
          breakpoint: z.string(),
        }),
      ),
      affectedNodeCount: z.int().nonnegative(),
      orderedSteps: z.array(z.string()),
    }),
  })
  .strict();
export type PlanBlockStylesOutput = z.infer<typeof PlanBlockStylesOutputSchema>;
