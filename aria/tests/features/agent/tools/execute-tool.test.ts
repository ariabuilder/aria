import { describe, expect, it } from "vitest";
import {
  isContentWriteToolName,
  isDesignWriteToolName,
  isReadToolName,
  listMcpToolsForScopes,
  SERVER_CLASS_TOOL_NAMES,
  SERVER_CMS_READ_TOOL_NAMES,
  SERVER_CMS_WRITE_TOOL_NAMES,
  SERVER_CONTENT_WRITE_TOOL_NAMES,
  SERVER_DESIGN_WRITE_TOOL_NAMES,
  SERVER_SETTINGS_WRITE_TOOL_NAMES,
  SERVER_FONT_MUTATION_TOOL_NAMES,
  SERVER_PUBLISH_TOOL_NAMES,
  SERVER_READ_TOOL_NAMES,
  SERVER_VARIABLE_TOOL_NAMES,
} from "../../../../admin/features/Agent/lib/tools/constants";

describe("executeTool registry", () => {
  it("lists phase 1a read tools", () => {
    expect(SERVER_READ_TOOL_NAMES).toContain("aria_list_pages");
    expect(SERVER_READ_TOOL_NAMES).toContain("aria_read_page");
    expect(SERVER_READ_TOOL_NAMES).toContain("aria_list_element_types");
    expect(SERVER_READ_TOOL_NAMES).toContain("aria_list_media");
    expect(SERVER_READ_TOOL_NAMES).toContain("aria_get_traffic_summary");
    expect(SERVER_CMS_READ_TOOL_NAMES).toContain("aria_get_cms_inventory");
    expect(SERVER_CMS_READ_TOOL_NAMES).toContain("aria_get_entry");
  });

  it("lists design system write tools", () => {
    expect(SERVER_DESIGN_WRITE_TOOL_NAMES).toContain(
      "aria_set_design_system_primary_color",
    );
    expect(SERVER_DESIGN_WRITE_TOOL_NAMES).toContain(
      "aria_save_design_system_colors",
    );
    expect(SERVER_DESIGN_WRITE_TOOL_NAMES).toContain(
      "aria_apply_design_system_template",
    );
  });

  it("lists content write tools", () => {
    expect(SERVER_CONTENT_WRITE_TOOL_NAMES).toContain("aria_update_page_meta");
    expect(SERVER_CONTENT_WRITE_TOOL_NAMES).toContain("aria_update_node_motion");
    expect(SERVER_CONTENT_WRITE_TOOL_NAMES).not.toContain("aria_list_media");
  });

  it("classifies read, content write, and design write tools", () => {
    expect(isReadToolName("aria_list_pages")).toBe(true);
    expect(isReadToolName("aria_list_media")).toBe(true);
    expect(isReadToolName("insert_nodes")).toBe(false);
    expect(isContentWriteToolName("aria_update_page_meta")).toBe(true);
    expect(isContentWriteToolName("aria_list_pages")).toBe(false);
    expect(isContentWriteToolName("aria_list_media")).toBe(false);
    expect(isDesignWriteToolName("aria_save_design_system_colors")).toBe(true);
    expect(isDesignWriteToolName("aria_list_pages")).toBe(false);
  });

  it("maps MCP scopes to tool lists", () => {
    expect(listMcpToolsForScopes(["mcp:read"])).toEqual([
      ...SERVER_READ_TOOL_NAMES,
      ...SERVER_CMS_READ_TOOL_NAMES,
    ]);
    expect(listMcpToolsForScopes(["mcp:read"])).toContain("aria_list_media");
    expect(listMcpToolsForScopes(["mcp:write"])).toEqual([
      ...SERVER_CONTENT_WRITE_TOOL_NAMES,
      ...SERVER_CMS_WRITE_TOOL_NAMES,
    ]);
    expect(listMcpToolsForScopes(["mcp:design"])).toEqual([
      ...SERVER_DESIGN_WRITE_TOOL_NAMES,
      ...SERVER_SETTINGS_WRITE_TOOL_NAMES,
      ...SERVER_CLASS_TOOL_NAMES,
      ...SERVER_VARIABLE_TOOL_NAMES,
      ...SERVER_FONT_MUTATION_TOOL_NAMES,
    ]);
    expect(listMcpToolsForScopes(["mcp:publish"])).toEqual([
      ...SERVER_PUBLISH_TOOL_NAMES,
    ]);
    expect(
      listMcpToolsForScopes(["mcp:read", "mcp:design", "mcp:write"]),
    ).toEqual([
      ...SERVER_READ_TOOL_NAMES,
      ...SERVER_CMS_READ_TOOL_NAMES,
      ...SERVER_CONTENT_WRITE_TOOL_NAMES,
      ...SERVER_CMS_WRITE_TOOL_NAMES,
      ...SERVER_DESIGN_WRITE_TOOL_NAMES,
      ...SERVER_SETTINGS_WRITE_TOOL_NAMES,
      ...SERVER_CLASS_TOOL_NAMES,
      ...SERVER_VARIABLE_TOOL_NAMES,
      ...SERVER_FONT_MUTATION_TOOL_NAMES,
    ]);
  });
});
