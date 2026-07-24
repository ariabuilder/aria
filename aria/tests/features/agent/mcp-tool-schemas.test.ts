import { describe, expect, it } from "vitest";
import {
  listMcpToolsForScopes,
  SERVER_TOOL_NAMES,
} from "../../../admin/features/Agent/lib/tools/constants";
import {
  CURATED_MCP_TOOL_DEFINITIONS,
  CURATED_MCP_TOOL_GROUPS,
  MCP_TOOL_INPUT_SCHEMAS,
  resolveCuratedMcpToolCall,
} from "../../../admin/features/Agent/server/mcp/server";

describe("MCP tool schemas", () => {
  it("defines a non-trivial JSON schema for every server tool", () => {
    const missing: string[] = [];
    const trivial: string[] = [];

    for (const name of SERVER_TOOL_NAMES) {
      const schema = MCP_TOOL_INPUT_SCHEMAS[name];
      if (!schema) {
        missing.push(name);
        continue;
      }
      const props = (schema as { properties?: Record<string, unknown> })
        .properties;
      if (
        schema.type === "object" &&
        (!props || Object.keys(props).length === 0) &&
        ![
          "aria_get_site_context",
          "aria_get_site_settings",
          "aria_get_localization_settings",
          "aria_get_discovery_report",
          "aria_get_discovery_artifacts",
          "aria_get_analytics_availability",
          "aria_list_installed_library_packs",
          "aria_check_library_updates",
          "aria_list_site_exports",
          "aria_get_latest_site_export",
          "aria_get_system_status",
          "aria_get_cache_stats",
          "aria_get_cache_observability",
          "aria_list_users",
          "aria_list_email_connections",
          "aria_list_email_routes",
          "aria_get_email_outbox_overview",
          "aria_get_auth_methods_config",
          "aria_get_two_factor_policy",
          "aria_get_platform_info",
          "aria_get_platform_metrics",
          "aria_list_pages",
          "aria_list_layouts",
          "aria_list_components",
          "aria_list_element_types",
          "aria_get_node_capabilities",
          "aria_get_font_config",
          "aria_list_classes",
        ].includes(name)
      ) {
        trivial.push(name);
      }
    }

    expect(missing, `missing schemas: ${missing.join(", ")}`).toEqual([]);
    expect(trivial, `trivial schemas: ${trivial.join(", ")}`).toEqual([]);
  });

  it("exposes motion updates on aria_mutate_node", () => {
    const schema = MCP_TOOL_INPUT_SCHEMAS.aria_mutate_node;
    const properties = schema.properties as Record<string, unknown>;
    const updates = properties.updates as {
      properties?: Record<string, unknown>;
    };

    expect(updates.properties).toHaveProperty("motion");
    expect(properties).toHaveProperty("breakpoint");
  });

  it("exposes a dedicated node motion write tool", () => {
    const schema = MCP_TOOL_INPUT_SCHEMAS.aria_update_node_motion;
    const properties = schema.properties as Record<string, unknown>;

    expect(schema.required).toEqual(["collection", "slug", "nodeId", "motion"]);
    expect(properties).toHaveProperty("motion");
  });

  it("exposes a small MCP surface while retaining every scoped operation", () => {
    expect(CURATED_MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "aria_get_site_context",
      "aria_manage_site",
      "aria_manage_documents",
      "aria_manage_content",
      "aria_manage_design",
      "aria_manage_media",
      "aria_manage_library_and_sync",
      "aria_publish",
    ]);

    const operations = [
      "aria_get_site_context",
      ...Object.values(CURATED_MCP_TOOL_GROUPS).flat(),
    ];
    expect(new Set(operations).size).toBe(operations.length);
    expect(new Set(operations)).toEqual(
      new Set(
        listMcpToolsForScopes([
          "mcp:read",
          "mcp:write",
          "mcp:design",
          "mcp:publish",
        ]),
      ),
    );
  });

  it("routes a grouped tool call to its scope-checked server operation", () => {
    expect(
      resolveCuratedMcpToolCall("aria_manage_documents", {
        operation: "aria_read_page",
        input: { collection: "pages", slug: "home" },
      }),
    ).toEqual({
      ok: true,
      toolName: "aria_read_page",
      args: { collection: "pages", slug: "home" },
    });
    expect(
      resolveCuratedMcpToolCall("aria_manage_documents", {
        operation: "aria_publish_page",
        input: {},
      }),
    ).toMatchObject({ ok: false });
  });

  it("makes grouped operations visible at the top level for MCP clients", () => {
    const documentsTool = CURATED_MCP_TOOL_DEFINITIONS.find(
      (tool) => tool.name === "aria_manage_documents",
    );
    const schema = documentsTool?.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const operation = schema.properties?.operation as {
      enum?: string[];
    };

    expect(schema.properties).toHaveProperty("operation");
    expect(schema.properties).toHaveProperty("input");
    expect(schema.required).toEqual(["operation", "input"]);
    expect(operation.enum).toContain("aria_read_page");
    expect(operation.enum).toContain("aria_save_document");
  });
});
