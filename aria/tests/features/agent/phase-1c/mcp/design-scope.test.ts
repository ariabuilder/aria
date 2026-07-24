import { describe, it, expect, vi } from "vitest";
import { executeTool } from "@/features/Agent/lib/tools/executeTool";
import type {
  AgentToolActionContext,
  ToolContext,
} from "@/features/Agent/lib/tools/types";
import type { McpScope } from "@/features/Agent/lib/schemas";

function mockActionContext(): AgentToolActionContext {
  return {
    locals: {} as never,
    request: new Request("https://test.local"),
    user: {
      id: "user-1",
      username: "test-user",
      role: "manager",
      capabilities: [],
    } as never,
  };
}

function toolCtx(scopes: McpScope[]): ToolContext {
  return {
    transport: "mcp",
    userId: "user-1",
    siteId: "default",
    scopes,
    actorLabel: "user-1",
  };
}

// Mock all handler functions to avoid real action calls
vi.mock("@/features/Agent/lib/tools/content/listClasses", () => ({
  ariaListClasses: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { classes: [] } }),
}));

vi.mock("@/features/Agent/lib/tools/design/fontTools", () => ({
  ariaListFonts: vi.fn().mockResolvedValue({ ok: true, data: { fonts: [] } }),
  ariaGetFontConfig: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaEnableGoogleFont: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaDisableFont: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaDeleteCustomFont: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaRenameCustomFont: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaUpdateGoogleFontVariants: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

vi.mock("@/features/Agent/lib/tools/classes/writeTools", () => ({
  ariaCreateClass: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaDeleteClass: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaRenameClass: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaDuplicateClass: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaUpdateClassRule: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaRemoveClassRule: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  ariaUpdateClassPseudoRule: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

vi.mock("@/features/Agent/lib/tools/classes/applyClass", () => ({
  ariaApplyClassToNodes: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

vi.mock("@/features/Agent/lib/tools/variables/writeTools", () => ({
  ariaManageCssVariables: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

vi.mock("@/features/Agent/lib/tools/design/regenerateCss", () => ({
  ariaRegenerateGlobalCss: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

vi.mock("@/features/Agent/lib/tools/activityLog", () => ({
  logAgentActivity: vi.fn(),
}));

describe("MCP design scope enforcement", () => {
  it("allows read tools with mcp:read scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_list_classes",
      args: {},
    });
    expect(result.ok).toBe(true);
  });

  it("rejects class create without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_create_class",
      args: { name: "test" },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("allows class create with mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read", "mcp:design"]),
      actionContext: mockActionContext(),
      toolName: "aria_create_class",
      args: { name: "test" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects class delete without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_delete_class",
      args: { name: "test" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects class rename without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_rename_class",
      args: { oldName: "a", newName: "b" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects class duplicate without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_duplicate_class",
      args: { sourceName: "a", newName: "b" },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects update class rule without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_update_class_rule",
      args: { className: "test", property: "color", value: "red" },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects remove class rule without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_remove_class_rule",
      args: { className: "test", property: "color" },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects apply class to nodes without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read", "mcp:write"]),
      actionContext: mockActionContext(),
      toolName: "aria_apply_class_to_nodes",
      args: {
        collection: "pages",
        slug: "home",
        className: "test",
        nodeIds: ["n1"],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects manage CSS variables without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_manage_css_variables",
      args: { variables: { test: "red" } },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects regenerate CSS without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_regenerate_global_css",
      args: {},
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects enable font without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_enable_google_font",
      args: { family: "Inter" },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("rejects disable font without mcp:design scope", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_disable_font",
      args: { fontId: "font-1" },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain("mcp:design");
  });

  it("allows font list with mcp:read only (read operation)", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_list_fonts",
      args: {},
    });
    expect(result.ok).toBe(true);
  });

  it("allows font config read with mcp:read only", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_get_font_config",
      args: {},
    });
    // aria_get_font_config is in the read tool category
    expect(result.ok).toBe(true);
  });

  it("allows list classes with mcp:read only (read operation)", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read"]),
      actionContext: mockActionContext(),
      toolName: "aria_list_classes",
      args: {},
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown tool name", async () => {
    const result = await executeTool({
      toolContext: toolCtx(["mcp:read", "mcp:write", "mcp:design"]),
      actionContext: mockActionContext(),
      toolName: "aria_nonexistent_tool",
      args: {},
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toContain(
      "not allowed via MCP",
    );
  });
});
