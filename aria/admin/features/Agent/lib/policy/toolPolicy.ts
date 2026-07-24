import { z } from "zod";
import type { ConfirmationCategory, McpScope } from "../schemas";
import {
  isContentWriteToolName,
  isAdminToolName,
  isCmsWriteToolName,
  isDesignExtendedToolName,
  isPublishToolName,
  isReadToolName,
  isServerToolName,
  type ServerToolName,
} from "../tools/constants";
import { supportsExactAgentUndo } from "../undo/reversibility";

export const ToolRiskSchema = z.enum([
  "read",
  "write",
  "destructive",
  "publish",
]);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const ToolReversibilitySchema = z.enum([
  "exact",
  "compensating",
  "none",
]);
export type ToolReversibility = z.infer<typeof ToolReversibilitySchema>;

export const ToolConfirmationPolicySchema = z.enum([
  "never",
  "conditional",
  "always",
]);
export type ToolConfirmationPolicy = z.infer<
  typeof ToolConfirmationPolicySchema
>;

export const ToolPolicySchema = z
  .object({
    toolName: z.string().min(1),
    scope: z.enum(["mcp:read", "mcp:write", "mcp:design", "mcp:publish"]),
    risk: ToolRiskSchema,
    reversibility: ToolReversibilitySchema,
    confirmation: ToolConfirmationPolicySchema,
    confirmationCategory: z
      .enum([
        "delete_content",
        "replace_variables",
        "publish",
        "bulk_operation",
      ])
      .nullable(),
    externalSideEffect: z.boolean(),
  })
  .strict();

export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

const DELETE_TOOL_NAMES = new Set<ServerToolName>([
  "aria_delete_document",
  "aria_delete_node",
  "aria_delete_media",
  "aria_delete_redirect",
  "aria_delete_collection",
  "aria_delete_entry",
  "aria_delete_class",
  "aria_delete_custom_font",
  "aria_uninstall_library_pack",
  "aria_delete_site_export",
  "aria_delete_media_transform_variant",
]);

function scopeForTool(toolName: ServerToolName): McpScope {
  if (isReadToolName(toolName)) return "mcp:read";
  if (isDesignExtendedToolName(toolName)) return "mcp:design";
  if (isPublishToolName(toolName)) return "mcp:publish";
  if (isContentWriteToolName(toolName) || isCmsWriteToolName(toolName)) {
    return "mcp:write";
  }
  return "mcp:read";
}

function confirmationCategoryForTool(
  toolName: ServerToolName,
): ConfirmationCategory | null {
  if (DELETE_TOOL_NAMES.has(toolName)) return "delete_content";
  if (toolName === "aria_manage_css_variables") return "replace_variables";
  if (toolName === "aria_apply_content_sync") return "bulk_operation";
  if (toolName === "aria_apply_media_sync") return "bulk_operation";
  if (isPublishToolName(toolName)) return "publish";
  return null;
}

export function getServerToolPolicy(toolName: ServerToolName): ToolPolicy {
  const confirmationCategory = confirmationCategoryForTool(toolName);
  const isDelete = DELETE_TOOL_NAMES.has(toolName);
  const isPublish = isPublishToolName(toolName);
  const isRead = isReadToolName(toolName) || isAdminToolName(toolName);

  return ToolPolicySchema.parse({
    toolName,
    scope: scopeForTool(toolName),
    risk: isRead
      ? "read"
      : isDelete
        ? "destructive"
        : isPublish
          ? "publish"
          : "write",
    reversibility: isRead
      ? "exact"
      : supportsExactAgentUndo(toolName)
        ? "exact"
        : isPublish
          ? "compensating"
          : "none",
    confirmation: confirmationCategory ? "always" : "never",
    confirmationCategory,
    externalSideEffect: isPublish,
  });
}

export function resolveToolPolicy(toolName: string): ToolPolicy | null {
  return isServerToolName(toolName) ? getServerToolPolicy(toolName) : null;
}
