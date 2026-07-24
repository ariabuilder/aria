import { z } from "zod";

import { log } from "@/lib/utils/logger";

const NonEmptyStringSchema = z.string().trim().min(1);

const DesignSystemActionErrorSchema = z
  .looseObject({
    message: NonEmptyStringSchema.optional(),
  });

const DesignSystemActionFailureSchema = z
  .looseObject({
    success: z.literal(false),
    error: DesignSystemActionErrorSchema.optional(),
  });

export const TypographyScaleStepSchema = z
  .object({
    id: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    size: z.number().positive(),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
  })
  .strict();

export const TypographyFamiliesSchema = z.object({
  body: NonEmptyStringSchema,
  heading: NonEmptyStringSchema,
  mono: NonEmptyStringSchema,
});

export const TypographyConfigSchema = z.object({
  families: TypographyFamiliesSchema,
  scale: z.array(TypographyScaleStepSchema).min(1),
  headingOverrides: z.record(z.string(), z.string().min(1)).optional(),
  bodyOverrides: z.record(z.string(), z.string().min(1)).optional(),
});

export type TypographyConfigRecord = z.infer<typeof TypographyConfigSchema>;

export const CustomFontSchema = z
  .looseObject({
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    family: NonEmptyStringSchema,
    url: NonEmptyStringSchema.optional(),
    format: NonEmptyStringSchema.optional(),
    formats: z
      .array(
        z
          .object({
            format: NonEmptyStringSchema,
            url: NonEmptyStringSchema,
          })
          .strict(),
      )
      .optional(),
    weight: NonEmptyStringSchema.optional(),
    style: NonEmptyStringSchema.optional(),
    uploadedAt: NonEmptyStringSchema.optional(),
  });

export type CustomFontRecord = z.infer<typeof CustomFontSchema>;

export const EnabledGoogleFontSchema = z
  .object({
    id: NonEmptyStringSchema,
    family: NonEmptyStringSchema,
    variants: z.array(NonEmptyStringSchema),
    googleFontsURL: NonEmptyStringSchema,
  })
  .strict();

export type EnabledGoogleFontRecord = z.infer<typeof EnabledGoogleFontSchema>;

export const GoogleFontSchema = z
  .object({
    family: NonEmptyStringSchema,
    variants: z.array(NonEmptyStringSchema),
    subsets: z.array(NonEmptyStringSchema),
    category: NonEmptyStringSchema,
  })
  .strict();

export type GoogleFontRecord = z.infer<typeof GoogleFontSchema>;

export const TypographyLoadActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        typography: TypographyConfigSchema,
      }),
  });

export const TypographySaveActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        typography: TypographyConfigSchema,
      }),
  });

export const FontConfigActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        customFonts: z.array(CustomFontSchema),
        enabledGoogleFonts: z.array(EnabledGoogleFontSchema),
      }),
  });

export const GoogleFontListActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    fonts: z.array(GoogleFontSchema),
    total: z.int().nonnegative().optional(),
    offset: z.int().nonnegative().optional(),
    limit: z.int().positive().optional(),
    hasMore: z.boolean().optional(),
  });

export const CustomFontActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    font: CustomFontSchema,
  });

export const EnabledGoogleFontActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    font: EnabledGoogleFontSchema,
  });

export const FontMutationActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
  });

interface ActionTransportErrorLike {
  message?: string;
}

interface ActionTransportResult {
  data?: unknown;
  error?: ActionTransportErrorLike | null;
}

export function unwrapTypographyDesignSystemActionResult<
  TSuccessSchema extends z.ZodTypeAny,
>(
  result: ActionTransportResult,
  successSchema: TSuccessSchema,
  fallback: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<TSuccessSchema> }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = z
    .union([successSchema, DesignSystemActionFailureSchema])
    .safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[Typography] Invalid design-system action response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  const data = parsedResult.data;
  const failureParsed = DesignSystemActionFailureSchema.safeParse(data);
  if (failureParsed.success) {
    return {
      success: false,
      error: failureParsed.data.error?.message ?? fallback,
    };
  }

  const successParsed = successSchema.safeParse(data);
  if (!successParsed.success) {
    log("warn", "[Typography] Invalid design-system action response", {
      issues: successParsed.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: successParsed.data,
  };
}

export function unwrapFontActionResult<TSuccessSchema extends z.ZodTypeAny>(
  result: ActionTransportResult,
  successSchema: TSuccessSchema,
  fallback: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<TSuccessSchema> }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = successSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[Typography] Invalid font action response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}
