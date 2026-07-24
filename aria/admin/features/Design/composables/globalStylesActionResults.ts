import { z } from "zod";

import { log } from "@/lib/utils/logger";
import { DesignSystemColorsSchema } from "../../../../lib/design/types";
import { GlobalStylesConfigSchema } from "../../../../lib/styles/universalDesignSystem";

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

export const GlobalStylesLoadActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        globalStyles: GlobalStylesConfigSchema,
      }),
  });

export const GlobalStylesSaveActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        globalStyles: GlobalStylesConfigSchema,
      }),
  });

export const VariableManagerBootstrapSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        globalStyles: GlobalStylesConfigSchema,
        colors: DesignSystemColorsSchema,
      }),
  });

interface ActionTransportErrorLike {
  message?: string;
}

interface ActionTransportResult {
  data?: unknown;
  error?: ActionTransportErrorLike | null;
}

export function unwrapGlobalStylesActionResult<
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
    log("warn", "[GlobalStyles] Invalid design-system action response", {
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
    log("warn", "[GlobalStyles] Invalid design-system action response", {
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
