import { log } from "@/lib/utils/logger";
import { z } from "zod";

import { PagePolicyResultSchema } from "../../../../lib/pages/policy";
import { PageDSLSchema } from "../../../../lib/schemas/nodes";
import type { PageDSL } from "../../../../lib/types/nodes";
import type { PagePolicyResult } from "../../../../lib/pages/policy";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const CrudActionErrorSchema = z
  .looseObject({
    message: z.string().trim().min(1).optional(),
  });

const CrudActionResultSchema = z.union([
  z
    .looseObject({
      success: z.literal(true),
      slug: z.string().trim().min(1),
      version: z.string().trim().min(1),
    }),
  z
    .looseObject({
      success: z.literal(false),
      error: CrudActionErrorSchema.optional(),
    }),
]);

export function unwrapPageSettingsPageResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: PageDSL } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = PageDSLSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Composer/PageSettings] Invalid page payload from getItem", {
      ...context,
      issues: parsedResult.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}

export function unwrapPageSettingsUpdateResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; slug: string; version: string }
  | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = CrudActionResultSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Composer/PageSettings] Invalid updateItem response", {
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
    version: parsedResult.data.version,
  };
}

export function unwrapPageSettingsPolicyResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: PagePolicyResult }
  | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = PagePolicyResultSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Composer/PageSettings] Invalid page policy payload", {
      ...context,
      issues: parsedResult.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}
