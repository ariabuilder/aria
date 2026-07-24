import { log } from "@/lib/utils/logger";
import { z } from "zod";

import {
  ComponentDSLSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "@/lib/schemas/nodes";
import type {
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "@/lib/types/nodes";

type StudioGetItemCollection = "components" | "pages" | "layouts";

interface ActionTransportErrorLike {
  message?: string;
}

interface ActionTransportResult {
  data?: unknown;
  error?: ActionTransportErrorLike | null;
}

const ComponentExportActionSuccessSchema = z.looseObject({
  success: z.literal(true),
  type: z.literal("component"),
  id: z.string().min(1),
  content: z.string(),
  filePath: z.string().min(1),
});

const ComponentExportActionFailureSchema = z.looseObject({
  success: z.literal(false),
  error: z.string().optional(),
});

const ComponentExportActionResultSchema = z.union([
  ComponentExportActionSuccessSchema,
  ComponentExportActionFailureSchema,
]);

const StudioGetItemSchemaMap = {
  components: ComponentDSLSchema,
  pages: PageDSLSchema,
  layouts: LayoutDSLSchema,
} as const;

type StudioGetItemDataMap = {
  components: ComponentDSL;
  pages: PageDSL;
  layouts: LayoutDSL;
};

export function parseStudioGetItemPayload<
  TCollection extends StudioGetItemCollection,
>(
  collection: TCollection,
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
): StudioGetItemDataMap[TCollection] | null {
  if (result.error || !result.data) {
    return null;
  }

  const parsed = StudioGetItemSchemaMap[collection].safeParse(result.data);
  if (!parsed.success) {
    log(
      "warn",
      `[Studio/ComponentProperties] Invalid ${collection} payload from getItem`,
      {
        collection,
        issues: parsed.error.issues,
        ...context,
      },
    );
    return null;
  }

  return parsed.data as StudioGetItemDataMap[TCollection];
}

export function unwrapComponentExportActionResult(
  result: ActionTransportResult,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<typeof ComponentExportActionSuccessSchema> }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallbackMessage,
    };
  }

  const parsedResult = ComponentExportActionResultSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log(
      "warn",
      "[Studio/ComponentProperties] Invalid exportItem action response",
      {
        issues: parsedResult.error.issues,
        ...context,
      },
    );
    return {
      success: false,
      error: fallbackMessage,
    };
  }

  if (!parsedResult.data.success) {
    return {
      success: false,
      error: parsedResult.data.error ?? fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}
