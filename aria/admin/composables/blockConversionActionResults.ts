import { log } from "@/lib/utils/logger";
import { z } from "zod";

import { ComponentDSLSchema } from "../../lib/schemas/nodes";
import type { ComponentDSL } from "../../lib/types/nodes";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const NonEmptyStringSchema = z.string().trim().min(1);

const CrudActionErrorSchema = z
  .looseObject({
    message: NonEmptyStringSchema.optional(),
  });

const CrudActionFailureSchema = z
  .looseObject({
    success: z.literal(false),
    error: CrudActionErrorSchema.optional(),
  });

const CrudCreateSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    slug: NonEmptyStringSchema,
  });

const CrudCreateResultSchema = z.union([
  CrudCreateSuccessSchema,
  CrudActionFailureSchema,
]);

const RawComponentSchema = z
  .looseObject({
    nodes: z.array(z.unknown()),
  });

export function resolveBlockConversionSlugCheckResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | { status: "available" }
  | { status: "exists"; data: ComponentDSL }
  | { status: "invalid"; error: string } {
  if (result?.error?.message || !result?.data) {
    return { status: "available" };
  }

  const parsedRawComponent = RawComponentSchema.safeParse(result.data);
  if (!parsedRawComponent.success) {
    log(
      "warn",
      "[Admin/BlockConversion] Invalid component payload from getItem",
      {
        ...context,
        issues: parsedRawComponent.error.issues,
      },
    );
    return {
      status: "invalid",
      error: fallbackMessage,
    };
  }

  const parsedComponent = ComponentDSLSchema.safeParse(result.data);
  if (!parsedComponent.success) {
    log(
      "warn",
      "[Admin/BlockConversion] Invalid component payload from getItem",
      {
        ...context,
        issues: parsedComponent.error.issues,
      },
    );
    return {
      status: "invalid",
      error: fallbackMessage,
    };
  }

  return {
    status: "exists",
    data: parsedComponent.data,
  };
}

export function unwrapBlockConversionCreateResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; slug: string } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = CrudCreateResultSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Admin/BlockConversion] Invalid createItem response", {
      ...context,
      issues: parsedResult.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  if (!parsedResult.data.success) {
    return {
      success: false,
      error: parsedResult.data.error?.message ?? fallbackMessage,
    };
  }

  return {
    success: true,
    slug: parsedResult.data.slug,
  };
}
