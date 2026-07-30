import { log } from "@/lib/utils/logger";
import { z } from "zod";

import {
  BreakpointDefinitionSchema,
  BuilderNodeSchema,
  JsonObjectSchema,
  LayoutRegionsSchema,
  PropSchemaDefinitionSchema,
  SlotDefinitionSchema,
} from "../../lib/schemas/nodes";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const NonEmptyStringSchema = z.string().trim().min(1);
const OptionalNonEmptyStringSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, NonEmptyStringSchema.optional());

const ComposeSettingsSchema = z
  .looseObject({
    cssVariables: z.record(z.string(), z.string()).optional(),
    breakpoints: z.array(BreakpointDefinitionSchema).optional(),
    utilityEngine: z.string().optional(),
    framework: z.string().optional(),
  });

const ComposeMetadataSchema = z
  .looseObject({
    id: NonEmptyStringSchema.optional(),
    name: NonEmptyStringSchema.optional(),
    title: NonEmptyStringSchema.optional(),
    description: z.string().optional(),
    slug: NonEmptyStringSchema.optional(),
    version: z.string().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    systemRole: z
      .enum(["standard", "not-found", "cms-collection", "cms-entry"])
      .optional(),
    accessMode: z
      .enum(["public", "password", "private", "unlisted"])
      .optional(),
    hasPassword: z.boolean().optional(),
    updatedAt: NonEmptyStringSchema.optional(),
    settings: ComposeSettingsSchema.optional(),
    frontmatter: JsonObjectSchema.optional(),
    layout: OptionalNonEmptyStringSchema,
    category: z.string().optional(),
    propSchema: z.array(PropSchemaDefinitionSchema).optional(),
    slots: z.array(SlotDefinitionSchema).optional(),
  });

const ComposeCurrentLayoutSchema = z
  .looseObject({
    id: NonEmptyStringSchema,
    slug: NonEmptyStringSchema.optional(),
    title: NonEmptyStringSchema.optional(),
    version: NonEmptyStringSchema.optional(),
    slots: z.array(SlotDefinitionSchema).optional(),
    regions: LayoutRegionsSchema,
  });

const ItemLoadingComposeResultSchema = z
  .looseObject({
    pageBlocks: z.array(BuilderNodeSchema),
    originalNodes: z.array(BuilderNodeSchema),
    nonce: NonEmptyStringSchema.nullable(),
    pageMetadata: ComposeMetadataSchema,
    currentLayout: ComposeCurrentLayoutSchema.nullish(),
  });

export type ItemLoadingComposeResult = z.infer<
  typeof ItemLoadingComposeResultSchema
>;

export function unwrapItemLoadingComposeResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: ItemLoadingComposeResult }
  | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  const parsedResult = ItemLoadingComposeResultSchema.safeParse(result?.data);
  if (!parsedResult.success) {
    log("warn", "[useItemLoading] Invalid compose action response", {
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
