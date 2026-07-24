import type { AgentShellContext, ToolProfileConfig } from "../schemas";
import { ToolProfileConfigSchema } from "../schemas";
import {
  SERVER_CLASS_TOOL_NAMES,
  SERVER_CMS_READ_TOOL_NAMES,
  SERVER_CMS_WRITE_TOOL_NAMES,
  SERVER_CONTENT_WRITE_TOOL_NAMES,
  SERVER_DESIGN_WRITE_TOOL_NAMES,
  SERVER_FONT_MUTATION_TOOL_NAMES,
  SERVER_PUBLISH_TOOL_NAMES,
  SERVER_READ_TOOL_NAMES,
  SERVER_SETTINGS_WRITE_TOOL_NAMES,
  SERVER_VARIABLE_TOOL_NAMES,
} from "./constants";

/**
 * Profile definitions — Zod-validated at module load time. Each profile declares
 * which server tool CATEGORIES and client tool CATEGORIES are registered.
 */
const PROFILES: Record<string, ToolProfileConfig> = {
  studio: ToolProfileConfigSchema.parse({
    id: "studio",
    description:
      "Read mode — content inspection, SEO metadata, and design system. Canvas/node writes excluded — open composer for those.",
    serverCategories: [
      "read",
      "cms_write",
      "seo_write",
      "design_write",
      "settings_write",
      "class_write",
      "variable_write",
      "font",
    ],
    clientCategories: ["navigate"],
  }),

  composer: ToolProfileConfigSchema.parse({
    id: "composer",
    description:
      "Full editing — blocks, nodes, content, design, classes, media, publish",
    serverCategories: [
      "read",
      "design_write",
      "settings_write",
      "content_write",
      "cms_write",
      "seo_write",
      "class_write",
      "variable_write",
      "font",
      "publish",
    ],
    clientCategories: ["navigate", "canvas", "file_upload"],
  }),

  design: ToolProfileConfigSchema.parse({
    id: "design",
    description:
      "Design system, classes, variables, fonts, global styles — no content writes",
    serverCategories: [
      "read",
      "design_write",
      "settings_write",
      "class_write",
      "variable_write",
      "font",
    ],
    clientCategories: [],
  }),

  mcp: ToolProfileConfigSchema.parse({
    id: "mcp",
    description:
      "External MCP client — all tools allowed, filtered by token scopes only",
    serverCategories: [
      "read",
      "design_write",
      "settings_write",
      "content_write",
      "cms_write",
      "seo_write",
      "class_write",
      "variable_write",
      "font",
      "publish",
    ],
    clientCategories: [],
  }),
};

/**
 * Resolve the tool profile for the current context. MCP transport:
 * always returns the `mcp` profile (token scopes handle filtering).
 */
export function resolveToolProfile(
  shellContext?: AgentShellContext,
  transport?: string,
): ToolProfileConfig {
  if (transport === "mcp") {
    return PROFILES.mcp;
  }

  const workspace = shellContext?.workspace;
  if (workspace === "collections") return PROFILES.studio;
  if (workspace === "design") return PROFILES.design;
  if (workspace === "composer") return PROFILES.composer;

  return PROFILES.studio;
}

/**
 * All available server tool categories and the tool names they include.
 */
export const SERVER_TOOL_CATEGORIES: Record<
  ToolProfileConfig["serverCategories"][number],
  readonly string[]
> = {
  read: [...SERVER_READ_TOOL_NAMES, ...SERVER_CMS_READ_TOOL_NAMES],
  design_write: [...SERVER_DESIGN_WRITE_TOOL_NAMES],
  settings_write: [...SERVER_SETTINGS_WRITE_TOOL_NAMES],
  seo_write: ["aria_update_page_seo"],
  content_write: [...SERVER_CONTENT_WRITE_TOOL_NAMES],
  cms_write: [...SERVER_CMS_WRITE_TOOL_NAMES],
  class_write: [...SERVER_CLASS_TOOL_NAMES],
  variable_write: [...SERVER_VARIABLE_TOOL_NAMES],
  font: [...SERVER_FONT_MUTATION_TOOL_NAMES],
  publish: [...SERVER_PUBLISH_TOOL_NAMES],
};

export const CLIENT_TOOL_CATEGORIES: Record<
  NonNullable<ToolProfileConfig["clientCategories"]>[number],
  readonly string[]
> = {
  navigate: ["open_in_composer"],
  canvas: [
    "insert_designed_section",
    "insert_nodes",
    "select_block",
    "update_node_motion",
  ],
  file_upload: ["upload_custom_font"],
};
