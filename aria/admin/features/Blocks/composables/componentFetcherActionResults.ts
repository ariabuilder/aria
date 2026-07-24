import { log } from "@/lib/utils/logger";
import { z } from "zod";

import {
  BuilderNodeSchema,
  ComponentDSLSchema,
} from "../../../../lib/schemas/nodes";
import type { BuilderNode, ComponentDSL } from "../../../../lib/types/nodes";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const RawComponentSchema = z
  .looseObject({
    nodes: z.array(z.unknown()),
  });

const ComponentComposeSchema = z
  .looseObject({
    pageBlocks: z.array(BuilderNodeSchema).optional(),
    originalNodes: z.array(BuilderNodeSchema).optional(),
  }).refine(
    (value) =>
      Array.isArray(value.pageBlocks) || Array.isArray(value.originalNodes),
    {
      message: "Compose response must include pageBlocks or originalNodes",
    },
  );

export function unwrapComponentFetcherItemResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: ComponentDSL } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedRawComponent = RawComponentSchema.safeParse(result?.data);
  if (!parsedRawComponent.success) {
    log("warn", "[Blocks/ComponentFetcher] Invalid component payload", {
      ...context,
      issues: parsedRawComponent.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  const parsedComponent = ComponentDSLSchema.safeParse(result?.data);
  if (!parsedComponent.success) {
    log("warn", "[Blocks/ComponentFetcher] Invalid component payload", {
      ...context,
      issues: parsedComponent.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsedComponent.data,
  };
}

export function unwrapComponentFetcherComposeResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: BuilderNode[] } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedCompose = ComponentComposeSchema.safeParse(result?.data);
  if (!parsedCompose.success) {
    log("warn", "[Blocks/ComponentFetcher] Invalid compose response", {
      ...context,
      issues: parsedCompose.error.issues,
    });
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  return {
    success: true,
    data:
      parsedCompose.data.pageBlocks ?? parsedCompose.data.originalNodes ?? [],
  };
}
