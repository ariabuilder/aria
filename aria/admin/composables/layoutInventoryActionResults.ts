import { log } from "@/lib/utils/logger";
import { z } from "zod";

import { LayoutDSLSchema } from "../../lib/schemas/nodes";
import type { LayoutDSL } from "../../lib/types/nodes";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const LayoutInventoryResultSchema = z
  .looseObject({
    layouts: z.array(LayoutDSLSchema),
  });

export function unwrapLayoutInventoryActionResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: LayoutDSL[] } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = LayoutInventoryResultSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Admin] Invalid init layout inventory response", {
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
    data: parsedResult.data.layouts,
  };
}
