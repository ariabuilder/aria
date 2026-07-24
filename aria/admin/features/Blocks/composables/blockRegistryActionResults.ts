import { log } from "@/lib/utils/logger";
import { z } from "zod";

import { ComponentDSLSchema } from "../../../../lib/schemas/nodes";
import type { ComponentDSL } from "../types";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const BlockRegistryComponentsResultSchema = z
  .looseObject({
    components: z.array(z.unknown()),
  });

const BlockRegistryRawComponentSchema = z
  .looseObject({
    nodes: z.array(z.unknown()),
  });

export function unwrapBlockRegistryComponentsResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: ComponentDSL[] } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = BlockRegistryComponentsResultSchema.safeParse(
    result?.data,
  );
  if (!parsedResult.success) {
    log("warn", "[Blocks] Invalid block registry components response", {
      ...context,
      issues: parsedResult.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  const parsedRawComponents = z
    .array(BlockRegistryRawComponentSchema)
    .safeParse(parsedResult.data.components);
  if (!parsedRawComponents.success) {
    log("warn", "[Blocks] Invalid block registry components response", {
      ...context,
      issues: parsedRawComponents.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  const parsedComponents = z
    .array(ComponentDSLSchema)
    .safeParse(parsedResult.data.components);
  if (!parsedComponents.success) {
    log("warn", "[Blocks] Invalid block registry components response", {
      ...context,
      issues: parsedComponents.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsedComponents.data as ComponentDSL[],
  };
}
