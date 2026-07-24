import { describe, expect, it } from "vitest";
import {
  buildClientAiTools,
  buildServerAiTools,
  SEO_SESSION_BLOCKED_SERVER_TOOLS,
} from "../../../../admin/features/Agent/lib/tools/buildAiTools";
import type {
  AgentSeoContext,
  AgentShellContext,
} from "../../../../admin/features/Agent/lib/schemas";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const composerShellContext: AgentShellContext = {
  mode: "composer",
  workspace: "composer",
  itemType: "page",
  itemSlug: "blog",
  itemTitle: "Blog",
  pageId: "blog",
  selectedBlockId: null,
  blockCount: 2,
  canClientInsert: true,
  canClientNavigate: true,
};

const seoContext: AgentSeoContext = {
  pageSlug: "blog",
  pageTitle: "Blog",
  field: "general",
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

describe("buildClientAiTools SEO sessions", () => {
  it("omits all client tools when seoContext is present", () => {
    const tools = buildClientAiTools(composerShellContext, seoContext);
    expect(Object.keys(tools)).toEqual([]);
  });
});

describe("buildServerAiTools SEO sessions", () => {
  it("exposes aria_update_page_seo in studio profile", () => {
    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: createContext(),
      shellContext: { workspace: "studio" } as AgentShellContext,
    });

    expect(Object.keys(tools)).toContain("aria_update_page_seo");
  });

  it("blocks node and composer server tools when seoContext is present", () => {
    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: createContext(),
      shellContext: composerShellContext,
      seoContext,
    });

    expect(Object.keys(tools)).toContain("aria_update_page_seo");
    for (const toolName of SEO_SESSION_BLOCKED_SERVER_TOOLS) {
      expect(Object.keys(tools)).not.toContain(toolName);
    }
  });
});
