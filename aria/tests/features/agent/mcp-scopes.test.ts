import { describe, expect, it } from "vitest";
import {
  assertMcpScopesAllowedForUser,
  canUserRequestMcpScope,
  filterMcpScopesForUser,
} from "../../../admin/features/Agent/lib/mcp/scopes";
import type { SessionUser } from "../../../lib/auth/types";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

function createUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: TEST_USER_ID,
    username: "test",
    email: "test@example.com",
    role: "administrator",
    totpEnabled: false,
    preferences: {},
    ...overrides,
  };
}

describe("MCP scopes", () => {
  it("allows mcp:read for studio agent users", () => {
    const user = createUser({ role: "contributor" });
    expect(filterMcpScopesForUser(user, ["mcp:read"])).toEqual(["mcp:read"]);
    expect(() => assertMcpScopesAllowedForUser(user, ["mcp:read"])).not.toThrow();
  });

  it("allows mcp:write for editPages users", () => {
    const user = createUser({ role: "administrator" });
    expect(canUserRequestMcpScope(user, "mcp:write")).toBe(true);
    expect(filterMcpScopesForUser(user, ["mcp:read", "mcp:write"])).toEqual([
      "mcp:read",
      "mcp:write",
    ]);
  });

  it("allows mcp:write for CMS editors", () => {
    const user = createUser({
      role: "content-editor",
      permissionProfile: {
        rolePreset: "content-editor",
        capabilityOverrides: { allow: ["editCms"] },
      },
    });
    expect(canUserRequestMcpScope(user, "mcp:write")).toBe(true);
    expect(filterMcpScopesForUser(user, ["mcp:read", "mcp:write"])).toEqual([
      "mcp:read",
      "mcp:write",
    ]);
  });

  it("allows write scope for contributors through CMS edit access", () => {
    const user = createUser({ role: "contributor" });
    expect(canUserRequestMcpScope(user, "mcp:write")).toBe(true);
  });

  it("allows mcp:design for editSiteSettings users", () => {
    const user = createUser({ role: "administrator" });
    expect(canUserRequestMcpScope(user, "mcp:design")).toBe(true);
    expect(filterMcpScopesForUser(user, ["mcp:read", "mcp:design"])).toEqual([
      "mcp:read",
      "mcp:design",
    ]);
  });

  it("rejects design scope for contributors", () => {
    const user = createUser({ role: "contributor" });
    expect(canUserRequestMcpScope(user, "mcp:design")).toBe(false);
    expect(() =>
      assertMcpScopesAllowedForUser(user, ["mcp:read", "mcp:design"]),
    ).toThrow(/role/i);
  });

  it("allows mcp:publish for publishContent users", () => {
    const user = createUser({
      role: "contributor",
      permissionProfile: {
        rolePreset: "contributor",
        capabilityOverrides: { allow: ["publishContent"] },
      },
    });
    expect(canUserRequestMcpScope(user, "mcp:publish")).toBe(true);
    expect(filterMcpScopesForUser(user, ["mcp:read", "mcp:publish"])).toEqual([
      "mcp:read",
      "mcp:publish",
    ]);
  });
});
