import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../../../admin/features/Agent/lib/tools/executeTool";
import type {
  AgentToolActionContext,
  ToolContext,
} from "../../../admin/features/Agent/lib/tools/types";

const { getTokenDbMock, tokenDb, ariaManageCssVariablesMock } = vi.hoisted(
  () => {
    const tokenDb = {
      execute: vi.fn(),
      queryAll: vi.fn(),
      queryFirst: vi.fn(),
    };
    return {
      getTokenDbMock: vi.fn(),
      tokenDb,
      ariaManageCssVariablesMock: vi.fn(),
    };
  },
);

vi.mock("../../../admin/features/Agent/lib/mcp/tokenDb", () => ({
  getTokenDb: (...args: unknown[]) => getTokenDbMock(...args),
}));

vi.mock("../../../admin/features/Agent/lib/tools/variables/writeTools", () => ({
  ariaManageCssVariables: (...args: unknown[]) =>
    ariaManageCssVariablesMock(...args),
}));

vi.mock("../../../admin/features/Agent/lib/tools/activityLog", () => ({
  logAgentActivity: vi.fn(),
}));

function toolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    transport: "studio_http",
    userId: "user-1",
    siteId: "default",
    scopes: ["mcp:read"],
    actorLabel: "user-1",
    ...overrides,
  };
}

function actionContext(userId = "user-1"): AgentToolActionContext {
  return {
    locals: {},
    request: new Request("https://app.example.com/admin"),
    user: {
      id: userId,
      username: userId,
      role: "administrator",
      totpEnabled: false,
    } as never,
  };
}

function pendingConfirmation(overrides: Record<string, unknown> = {}) {
  return {
    id: "confirmation-1",
    user_id: "user-1",
    tool_name: "aria_manage_css_variables",
    args: JSON.stringify({ variables: { approved: "red" } }),
    category: "replace_variables",
    transport: "studio_http",
    created_at: "2026-06-29T00:00:00.000Z",
    expires_at: "2026-06-29T00:01:00.000Z",
    ...overrides,
  };
}

describe("agent tool confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenDbMock.mockResolvedValue(tokenDb);
    tokenDb.execute.mockResolvedValue(undefined);
    tokenDb.queryFirst.mockResolvedValue(pendingConfirmation());
    ariaManageCssVariablesMock.mockResolvedValue({
      ok: true,
      data: { success: true },
    });
  });

  it("rejects a confirmation token used for a different tool", async () => {
    const result = await executeTool({
      toolContext: toolContext(),
      actionContext: actionContext(),
      toolName: "aria_delete_document",
      args: undefined,
      confirmationToken: "confirmation-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("does not match");
    expect(ariaManageCssVariablesMock).not.toHaveBeenCalled();
  });

  it("executes stored args and ignores replacement args on confirmation", async () => {
    const result = await executeTool({
      toolContext: toolContext(),
      actionContext: actionContext(),
      toolName: "aria_manage_css_variables",
      args: { variables: { injected: "blue" } },
      confirmationToken: "confirmation-1",
    });

    expect(result.ok).toBe(true);
    expect(ariaManageCssVariablesMock).toHaveBeenCalledWith(
      expect.anything(),
      { variables: { approved: "red" } },
    );
  });

  it("rejects a confirmation token for another user", async () => {
    tokenDb.queryFirst.mockResolvedValue(
      pendingConfirmation({ user_id: "user-2" }),
    );

    const result = await executeTool({
      toolContext: toolContext(),
      actionContext: actionContext(),
      toolName: "aria_manage_css_variables",
      args: undefined,
      confirmationToken: "confirmation-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("does not match");
    expect(ariaManageCssVariablesMock).not.toHaveBeenCalled();
  });

  it("requires confirmation for every high-impact action", async () => {
    const result = await executeTool({
      toolContext: toolContext(),
      actionContext: actionContext(),
      toolName: "aria_manage_css_variables",
      args: { variables: { primary: "red" } },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("CONFIRMATION_REQUIRED");
    expect(ariaManageCssVariablesMock).not.toHaveBeenCalled();
  });
});
