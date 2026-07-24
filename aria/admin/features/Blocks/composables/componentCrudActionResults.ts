import { z } from "zod";

import {
  parseActionPayload,
  unwrapActionPayload,
  type ActionTransportResult,
} from "@/lib/actions/actionResult";
import { ComponentDSLSchema } from "../../../../lib/schemas/nodes";
import type { ComponentDSL } from "../../../../lib/types/nodes";

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

const CrudCreateOrUpdateSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    slug: NonEmptyStringSchema,
  });

const CrudDeleteSuccessSchema = z
  .looseObject({
    success: z.literal(true),
  });

const ComponentCrudActionResultSchemas = {
  create: z.union([CrudCreateOrUpdateSuccessSchema, CrudActionFailureSchema]),
  update: z.union([CrudCreateOrUpdateSuccessSchema, CrudActionFailureSchema]),
  delete: z.union([CrudDeleteSuccessSchema, CrudActionFailureSchema]),
} as const;

const ComponentCrudFallbackMessages = {
  create: "Failed to create component",
  update: "Failed to update component",
  delete: "Failed to delete component",
} as const;

const RawComponentSchema = z
  .looseObject({
    nodes: z.array(z.unknown()),
  });

export type ComponentCrudActionKind =
  keyof typeof ComponentCrudActionResultSchemas;

export function unwrapComponentItemResult(
  result: ActionTransportResult,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: ComponentDSL } | { success: false; error: string } {
  const rawComponent = unwrapActionPayload(result, RawComponentSchema, {
    fallbackMessage,
    invalidLogMessage: "[Blocks/Components] Invalid getItem component response",
    context,
  });
  if (!rawComponent.success) return rawComponent;

  const parsedComponent = parseActionPayload(result?.data, ComponentDSLSchema, {
    invalidLogMessage: "[Blocks/Components] Invalid getItem component response",
    context,
  });
  if (!parsedComponent) return { success: false, error: fallbackMessage };

  return {
    success: true,
    data: parsedComponent,
  };
}

export function unwrapComponentCrudActionResult(
  kind: ComponentCrudActionKind,
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
):
  | {
      success: true;
      slug?: string;
    }
  | {
      success: false;
      error: string;
    } {
  const fallbackMessage = ComponentCrudFallbackMessages[kind];

  const parsedResult = unwrapActionPayload(
    result,
    ComponentCrudActionResultSchemas[kind],
    {
      fallbackMessage,
      invalidLogMessage: `[Blocks/Components] Invalid ${kind}Item response`,
      context: {
        ...context,
        kind,
      },
    },
  );
  if (!parsedResult.success) {
    return parsedResult;
  }

  if (!parsedResult.data.success) {
    return {
      success: false,
      error: parsedResult.data.error?.message ?? fallbackMessage,
    };
  }

  const successData = parsedResult.data;
  if ("slug" in successData && typeof successData.slug === "string") {
    return {
      success: true,
      slug: successData.slug,
    };
  }

  return { success: true };
}
