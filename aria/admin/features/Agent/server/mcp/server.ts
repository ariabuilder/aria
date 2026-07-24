import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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
  SERVER_TOOL_NAMES,
  SERVER_VARIABLE_TOOL_NAMES,
} from "../../lib/tools/constants";
import { getServerToolInputJsonSchema } from "../../lib/capabilities/serverToolSchemas";
import type { ServerToolName } from "../../lib/tools/constants";
import type { AgentToolActionContext } from "../../lib/tools/types";
import type { SessionUser } from "../../../../../lib/auth/types";
import type { McpTokenRecord } from "../../lib/schemas";

/** MCP tool input schemas — canonical Zod JSON Schema via getServerToolInputJsonSchema. */
export const MCP_TOOL_INPUT_SCHEMAS: Record<
  string,
  Record<string, unknown>
> = Object.fromEntries(
  SERVER_TOOL_NAMES.map((toolName) => [
    toolName,
    getServerToolInputJsonSchema(toolName),
  ]),
);

const MCP_TOOL_DESCRIPTIONS: Record<string, string> = {
  aria_get_localization_settings:
    "Read the site's default content locale, enabled locales, and fallback chains. Studio UI language is separate and per-user.",
  aria_update_localization_settings:
    "Replace site content-localization settings with validated BCP 47 locales and acyclic fallback chains. Read current settings first.",
  aria_get_entry_translation_context:
    "Read canonical source content, locale variant states, and the translatable/protected field manifest for a CMS entry. Always use before translating.",
  aria_save_entry_translation:
    "Create a missing or explicitly update an existing locale variant. Preserve protected fields and publication status; never overwrite an existing translation with create_missing.",
  aria_get_node_capabilities:
    "Return cross-element BuilderNode field schemas, including Aria Motion.",
  aria_mutate_node:
    "Update a single node's props, styles, or motion within a page, layout, or component.",
  aria_update_node_motion:
    "Apply Aria Motion to a single node in a saved page, layout, or component. Use this for animation/motion edits from MCP.",
};

void MCP_TOOL_DESCRIPTIONS;

const DOCUMENT_TOOL_NAMES = [
  "aria_list_pages",
  "aria_read_page",
  "aria_list_page_versions",
  "aria_get_page_version",
  "aria_list_components",
  "aria_read_component",
  "aria_list_layouts",
  "aria_read_layout",
  "aria_list_element_types",
  "aria_get_node_capabilities",
  "aria_create_page",
  "aria_create_layout",
  "aria_create_component",
  "aria_duplicate_document",
  "aria_save_document",
  "aria_delete_document",
  "aria_update_page_meta",
  "aria_update_page_seo",
  "aria_insert_nodes",
  "aria_mutate_node",
  "aria_update_node_motion",
  "aria_update_node_classes",
  "aria_replace_node",
  "aria_move_node",
  "aria_delete_node",
  "aria_update_layout_slots",
  "aria_attach_media_to_node",
] as const satisfies readonly ServerToolName[];

const MEDIA_TOOL_NAMES = [
  "aria_list_media",
  "aria_get_media_usages",
  "aria_get_media_transform_state",
  "aria_list_media_sync_history",
  "aria_delete_media",
  "aria_rename_media",
  "aria_duplicate_media",
  "aria_import_media_from_url",
  "aria_set_page_cover",
  "aria_save_media_profile",
  "aria_save_media_transform_variant",
  "aria_delete_media_transform_variant",
  "aria_rebuild_media_usage_index",
  "aria_plan_media_sync",
  "aria_apply_media_sync",
] as const satisfies readonly ServerToolName[];

const LIBRARY_AND_SYNC_TOOL_NAMES = [
  "aria_search_library",
  "aria_list_installed_library_packs",
  "aria_check_library_updates",
  "aria_list_site_exports",
  "aria_get_latest_site_export",
  "aria_get_content_sync_status",
  "aria_list_content_sync_history",
  "aria_install_library_pack",
  "aria_install_library_component",
  "aria_uninstall_library_pack",
  "aria_create_site_export",
  "aria_delete_site_export",
  "aria_plan_content_sync",
  "aria_apply_content_sync",
] as const satisfies readonly ServerToolName[];

const DESIGN_TOOL_NAMES = [
  "aria_get_design_system",
  "aria_preview_design_system_patch",
  "aria_list_fonts",
  "aria_get_font_config",
  "aria_list_classes",
  ...SERVER_DESIGN_WRITE_TOOL_NAMES,
  ...SERVER_CLASS_TOOL_NAMES,
  ...SERVER_VARIABLE_TOOL_NAMES,
  ...SERVER_FONT_MUTATION_TOOL_NAMES,
] as const satisfies readonly ServerToolName[];

const SITE_TOOL_NAMES = [
  "aria_get_discovery_report",
  "aria_get_discovery_artifacts",
  "aria_get_discovery_baseline",
  "aria_get_analytics_availability",
  "aria_get_traffic_summary",
  "aria_get_site_traffic",
  "aria_get_pages_traffic",
  "aria_get_page_traffic",
  "aria_get_site_settings",
  "aria_get_localization_settings",
  "aria_list_redirects",
  ...SERVER_SETTINGS_WRITE_TOOL_NAMES,
  "aria_create_redirect",
  "aria_update_redirect",
  "aria_delete_redirect",
] as const satisfies readonly ServerToolName[];

/**
 * A deliberately small MCP surface for general-purpose coding clients.
 * Each capability routes to existing, scope-checked server operations.
 */
export const CURATED_MCP_TOOL_GROUPS = {
  aria_manage_site: SITE_TOOL_NAMES,
  aria_manage_documents: DOCUMENT_TOOL_NAMES,
  aria_manage_content: [
    ...SERVER_CMS_READ_TOOL_NAMES,
    ...SERVER_CMS_WRITE_TOOL_NAMES,
  ],
  aria_manage_design: DESIGN_TOOL_NAMES,
  aria_manage_media: MEDIA_TOOL_NAMES,
  aria_manage_library_and_sync: LIBRARY_AND_SYNC_TOOL_NAMES,
  aria_publish: SERVER_PUBLISH_TOOL_NAMES,
} as const satisfies Record<string, readonly ServerToolName[]>;

export const CURATED_MCP_TOOL_NAMES = [
  "aria_get_site_context",
  ...Object.keys(CURATED_MCP_TOOL_GROUPS),
] as const;

const MCP_OPERATION_NAMES = [
  ...SERVER_READ_TOOL_NAMES,
  ...SERVER_CMS_READ_TOOL_NAMES,
  ...SERVER_DESIGN_WRITE_TOOL_NAMES,
  ...SERVER_SETTINGS_WRITE_TOOL_NAMES,
  ...SERVER_CONTENT_WRITE_TOOL_NAMES,
  ...SERVER_CMS_WRITE_TOOL_NAMES,
  ...SERVER_CLASS_TOOL_NAMES,
  ...SERVER_VARIABLE_TOOL_NAMES,
  ...SERVER_FONT_MUTATION_TOOL_NAMES,
  ...SERVER_PUBLISH_TOOL_NAMES,
] as const satisfies readonly ServerToolName[];

function assertCuratedMcpCoverage(): void {
  const operations = [
    "aria_get_site_context" as const,
    ...Object.values(CURATED_MCP_TOOL_GROUPS).flat(),
  ];
  const counts = new Map<ServerToolName, number>();
  for (const operation of operations) {
    counts.set(operation, (counts.get(operation) ?? 0) + 1);
  }

  const missing = MCP_OPERATION_NAMES.filter((name) => !counts.has(name));
  const duplicated = [...counts].filter(([, count]) => count > 1);
  if (missing.length > 0 || duplicated.length > 0) {
    throw new Error(
      `Curated MCP groups must cover every server tool exactly once. Missing: ${missing.join(", ") || "none"}; duplicated: ${duplicated.map(([name]) => name).join(", ") || "none"}`,
    );
  }
}

assertCuratedMcpCoverage();

function getGroupedMcpInputSchema(
  operations: readonly ServerToolName[],
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: operations,
        description: "The Aria operation to perform.",
      },
      input: {
        type: "object",
        description: "Arguments for the selected operation.",
      },
    },
    required: ["operation", "input"],
    additionalProperties: false,
    oneOf: operations.map((operation) => ({
      type: "object",
      properties: {
        operation: { const: operation },
        input: MCP_TOOL_INPUT_SCHEMAS[operation],
      },
      required: ["operation", "input"],
      additionalProperties: false,
    })),
  };
}

export const CURATED_MCP_TOOL_DEFINITIONS = [
  {
    name: "aria_get_site_context",
    description:
      "Get the essential Aria site context before making other changes. Always inspect styling.utilityClassesAllowed before inserting or changing classes: utility classNames are allowed only when it is true; otherwise use customClasses only.",
    inputSchema: MCP_TOOL_INPUT_SCHEMAS.aria_get_site_context,
  },
  {
    name: "aria_manage_site",
    description:
      "Inspect or update site settings, localization, discovery, analytics, traffic, and redirects. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(CURATED_MCP_TOOL_GROUPS.aria_manage_site),
  },
  {
    name: "aria_manage_documents",
    description:
      "List, read, create, edit, or delete pages, layouts, components, and their nodes. Before inserting or changing classes, call aria_get_site_context: utility classNames are allowed only when styling.utilityClassesAllowed is true; otherwise use customClasses only. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(
      CURATED_MCP_TOOL_GROUPS.aria_manage_documents,
    ),
  },
  {
    name: "aria_manage_content",
    description:
      "Inspect or manage CMS collections, entries, translations, revisions, and reviews. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(CURATED_MCP_TOOL_GROUPS.aria_manage_content),
  },
  {
    name: "aria_manage_design",
    description:
      "Inspect or manage the design system, styles, classes, CSS variables, and fonts. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(CURATED_MCP_TOOL_GROUPS.aria_manage_design),
  },
  {
    name: "aria_manage_media",
    description:
      "Inspect or manage media, transformations, usage, profiles, and media synchronization. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(CURATED_MCP_TOOL_GROUPS.aria_manage_media),
  },
  {
    name: "aria_manage_library_and_sync",
    description:
      "Search or manage library packs, components, site exports, and content synchronization. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(
      CURATED_MCP_TOOL_GROUPS.aria_manage_library_and_sync,
    ),
  },
  {
    name: "aria_publish",
    description:
      "Publish, unpublish, archive, or restore pages and CMS entries. Select an operation and provide its input.",
    inputSchema: getGroupedMcpInputSchema(CURATED_MCP_TOOL_GROUPS.aria_publish),
  },
] as const;

export function resolveCuratedMcpToolCall(
  name: string,
  args: unknown,
): { ok: true; toolName: ServerToolName; args: unknown } | { ok: false; error: string } {
  if (name === "aria_get_site_context") {
    return { ok: true, toolName: name, args };
  }

  const operations = CURATED_MCP_TOOL_GROUPS[
    name as keyof typeof CURATED_MCP_TOOL_GROUPS
  ];
  if (!operations) {
    return { ok: false, error: `Unknown MCP tool: ${name}` };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {
      ok: false,
      error: "A grouped MCP tool requires an operation and input object.",
    };
  }

  const { operation, input } = args as {
    operation?: unknown;
    input?: unknown;
  };
  if (
    typeof operation !== "string" ||
    !new Set<string>(operations).has(operation)
  ) {
    return {
      ok: false,
      error: `Operation must be one of: ${operations.join(", ")}`,
    };
  }

  return { ok: true, toolName: operation as ServerToolName, args: input };
}

function buildMcpServer(input: {
  actionContext: AgentToolActionContext;
  token: McpTokenRecord;
  actorUser: SessionUser | null;
}): McpServer {
  const mcp = new McpServer(
    { name: "aria-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const server = mcp.server;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: CURATED_MCP_TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const resolved = resolveCuratedMcpToolCall(
      request.params.name,
      request.params.arguments ?? {},
    );
    if (!resolved.ok) {
      return {
        content: [{ type: "text", text: resolved.error }],
        isError: true,
      };
    }

    const { executeTool } = await import("../../lib/tools/executeTool");
    const result = await executeTool({
      toolContext: {
        transport: "mcp",
        userId: input.token.userId,
        siteId: "default",
        scopes: input.token.scopes,
        actorLabel: input.token.userId
          ? `user:${input.token.userId}`
          : `service:${input.token.id}`,
        tokenId: input.token.id,
      },
      actionContext: {
        ...input.actionContext,
        user: input.actorUser,
      },
      toolName: resolved.toolName,
      args: resolved.args,
    });

    if (!result.ok) {
      return {
        content: [{ type: "text", text: result.error }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  });

  return mcp;
}

export async function handleMcpHttpRequest(input: {
  request: Request;
  actionContext: AgentToolActionContext;
  token: McpTokenRecord;
  actorUser: SessionUser | null;
}): Promise<Response> {
  const mcp = buildMcpServer(input);
  // This route runs in a Cloudflare Worker and receives web-standard Request
  // objects. The Node HTTP transport expects IncomingMessage/ServerResponse;
  // use the web-standard transport in stateless mode because this handler
  // creates a new server and transport for every request.
  const transport = new WebStandardStreamableHTTPServerTransport();

  await mcp.connect(transport);
  return transport.handleRequest(input.request);
}

export { SERVER_READ_TOOL_NAMES, SERVER_DESIGN_WRITE_TOOL_NAMES };
