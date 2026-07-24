import { describe, expect, it } from "vitest";
import {
  buildServerAiTools,
  canAgentWriteDesignSystem,
} from "../../../../admin/features/Agent/lib/tools/buildAiTools";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

function createContext(user: SessionUser): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test/admin"),
    user,
  };
}

describe("design system write tool gating", () => {
  it("enables write tools for administrators", () => {
    const context = createContext({
      id: TEST_USER_ID,
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      preferences: {},
    });

    expect(canAgentWriteDesignSystem(context)).toBe(true);

    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: context,
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain(
      "aria_set_design_system_primary_color",
    );
    expect(Object.keys(tools)).toContain("aria_save_design_system_colors");
    expect(Object.keys(tools)).toContain("aria_apply_design_system_template");
  });

  it("keeps design system read-only for contributors", () => {
    const context = createContext({
      id: TEST_USER_ID,
      username: "editor",
      email: "editor@example.com",
      role: "contributor",
      totpEnabled: false,
      preferences: {},
    });

    expect(canAgentWriteDesignSystem(context)).toBe(false);

    const tools = buildServerAiTools({
      transport: "studio_http",
      actionContext: context,
      exposeAllCapabilities: true,
    });

    expect(Object.keys(tools)).toContain("aria_get_design_system");
    expect(Object.keys(tools)).not.toContain("aria_save_design_system_colors");
  });
});
