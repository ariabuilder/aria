import { describe, expect, it } from "vitest";
import {
  buildClientAiTools,
  buildServerAiTools,
  canAgentWritePages,
} from "../../../../admin/features/Agent/lib/tools/buildAiTools";
import type { AgentShellContext } from "../../../../admin/features/Agent/lib/schemas";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const studioShellContext: AgentShellContext = {
  mode: "studio",
  workspace: "studio",
  itemType: null,
  itemSlug: null,
  itemTitle: null,
  pageId: null,
  selectedBlockId: null,
  blockCount: 0,
  canClientInsert: false,
  canClientNavigate: true,
};

const composerShellContext: AgentShellContext = {
  mode: "composer",
  workspace: "composer",
  itemType: "page",
  itemSlug: "contact",
  itemTitle: "Contact",
  pageId: "contact",
  selectedBlockId: null,
  blockCount: 2,
  canClientInsert: true,
  canClientNavigate: true,
};

function createContext(
  role: SessionUser["role"] = "administrator",
): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test/admin"),
    user: {
      id: TEST_USER_ID,
      username: "admin",
      email: "admin@example.com",
      role,
      totpEnabled: false,
      preferences: {},
    },
  };
}

describe("buildClientAiTools", () => {
  it("exposes open_in_composer in studio mode when navigation is allowed", () => {
    const tools = buildClientAiTools(studioShellContext);
    expect(Object.keys(tools)).toEqual(["open_in_composer"]);
  });

  it("exposes canvas tools when composer is open", () => {
    const tools = buildClientAiTools(composerShellContext);
    expect(Object.keys(tools)).toEqual([
      "open_in_composer",
      "insert_designed_section",
      "insert_nodes",
      "select_block",
      "update_node_motion",
      "upload_custom_font",
    ]);
  });

  it("returns no client tools when navigation and insert are unavailable", () => {
    const tools = buildClientAiTools({
      ...studioShellContext,
      canClientNavigate: false,
    });
    expect(Object.keys(tools)).toEqual([]);
  });

  it("returns no client tools during SEO sessions", () => {
    const tools = buildClientAiTools(studioShellContext, {
      pageSlug: "blog",
      pageTitle: "Blog",
      field: "general",
    });
    expect(Object.keys(tools)).toEqual([]);
  });

  it("returns no client tools in Ask mode", () => {
    expect(
      Object.keys(buildClientAiTools(composerShellContext, undefined, "ask")),
    ).toEqual([]);
  });
});

describe("page write tool gating", () => {
  it("exposes compact site context as a read tool", () => {
    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: createContext("administrator"),
      shellContext: studioShellContext,
    });

    expect(Object.keys(tools)).toContain("aria_get_site_context");
  });

  it("enables aria_update_page_meta for administrators", () => {
    const context = createContext("administrator");
    expect(canAgentWritePages(context)).toBe(true);

    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: context,
      shellContext: composerShellContext,
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain("aria_update_page_meta");
    expect(Object.keys(tools)).not.toContain("aria_insert_nodes");
    expect(Object.keys(tools)).not.toContain("aria_update_node_motion");
    expect(Object.keys(buildClientAiTools(composerShellContext))).toContain(
      "insert_nodes",
    );
    expect(Object.keys(buildClientAiTools(composerShellContext))).toContain(
      "update_node_motion",
    );
  });

  it("limits Ask mode to server read tools", () => {
    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: createContext("administrator"),
      shellContext: composerShellContext,
      composerMode: "ask",
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain("aria_read_page");
    expect(Object.keys(tools)).not.toContain("aria_update_page_meta");
    expect(Object.keys(tools)).not.toContain("aria_update_page_seo");
    expect(Object.keys(tools)).not.toContain("aria_apply_design_system_patch");
  });

  it("keeps server insertion available when no live Composer owns the document", () => {
    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: createContext("administrator"),
      shellContext: { ...composerShellContext, canClientInsert: false },
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain("aria_insert_nodes");
  });

  it("exposes CMS write tools in the collections workspace for CMS editors", () => {
    const context = createContext("administrator");

    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: context,
      shellContext: { ...studioShellContext, workspace: "collections" },
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain("aria_get_cms_inventory");
    expect(Object.keys(tools)).toContain("aria_create_collection");
    expect(Object.keys(tools)).toContain("aria_bind_node_field");
  });

  it("exposes CMS writes to contributors because CMS editing is available to them", () => {
    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: createContext("contributor"),
      shellContext: { ...studioShellContext, workspace: "collections" },
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain("aria_get_cms_inventory");
    expect(Object.keys(tools)).toContain("aria_create_collection");
  });

  it("keeps page metadata read-only for contributors", () => {
    const context = createContext("contributor");
    expect(canAgentWritePages(context)).toBe(false);

    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: context,
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).not.toContain("aria_update_page_meta");
  });
});
