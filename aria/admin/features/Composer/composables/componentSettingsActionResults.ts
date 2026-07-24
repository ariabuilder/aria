import { log } from "@/lib/utils/logger";
import { z } from "zod";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

export type ComponentSettingsUsageNode = {
  componentRef?: string;
  children?: ComponentSettingsUsageNode[];
};

export interface ComponentSettingsUsagePage {
  id: string;
  slug?: string;
  title?: string;
  nodes?: ComponentSettingsUsageNode[];
}

export interface ComponentSettingsUsageLayout {
  id: string;
  name?: string;
  nodes?: ComponentSettingsUsageNode[];
}

const UsageNodeSchema: z.ZodType<ComponentSettingsUsageNode> = z.lazy(() =>
  z
    .looseObject({
      componentRef: z.string().optional(),
      children: z.array(UsageNodeSchema).optional(),
    }),
);

const UsagePageSchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().optional(),
    title: z.string().optional(),
    nodes: z.array(UsageNodeSchema).optional(),
  });

const UsageLayoutSchema = z
  .looseObject({
    id: z.string().min(1),
    name: z.string().optional(),
    nodes: z.array(UsageNodeSchema).optional(),
  });

const ComponentSettingsUsageSchema = z
  .looseObject({
    pages: z.array(UsagePageSchema).default([]),
    layouts: z.array(UsageLayoutSchema).default([]),
  });

const ComponentExportSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    type: z.literal("component"),
    id: z.string().min(1),
    content: z.string(),
    filePath: z.string().min(1),
  });

const ComponentExportFailureSchema = z
  .looseObject({
    success: z.literal(false),
    error: z.string().optional(),
  });

const ComponentExportResultSchema = z.union([
  ComponentExportSuccessSchema,
  ComponentExportFailureSchema,
]);

export function unwrapComponentSettingsUsageResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | {
      success: true;
      data: {
        pages: ComponentSettingsUsagePage[];
        layouts: ComponentSettingsUsageLayout[];
      };
    }
  | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = ComponentSettingsUsageSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Composer/ComponentSettings] Invalid init usage response", {
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
    data: {
      pages: parsedResult.data.pages,
      layouts: parsedResult.data.layouts,
    },
  };
}

export function unwrapComponentSettingsExportResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | {
      success: true;
      data: {
        content?: string;
      };
    }
  | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = ComponentExportResultSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[Composer/ComponentSettings] Invalid exportItem response", {
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
      error: parsedResult.data.error ?? fallbackMessage,
    };
  }

  return {
    success: true,
    data: {
      content: parsedResult.data.content,
    },
  };
}
