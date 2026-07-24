import { hasEffectiveCapability } from "../../../../../lib/auth";
import type { Capability } from "../../../../../lib/auth/types";
import type { SessionUser } from "../../../../../lib/auth/types";
import type { McpScope } from "../schemas";

const SCOPE_CAPABILITY: Partial<Record<McpScope, Capability>> = {
  "mcp:read": "useStudioAgent",
  "mcp:design": "editSiteSettings",
  "mcp:publish": "publishContent",
};

const ALLOWED_MCP_SCOPES: McpScope[] = [
  "mcp:read",
  "mcp:write",
  "mcp:design",
  "mcp:publish",
];

export function filterAllowedMcpScopes(
  scopes: readonly McpScope[],
): McpScope[] {
  return scopes.filter((scope) => ALLOWED_MCP_SCOPES.includes(scope));
}

export function filterMcpScopesForUser(
  user: SessionUser,
  scopes: readonly McpScope[],
): McpScope[] {
  return filterAllowedMcpScopes(scopes).filter((scope) => {
    if (scope === "mcp:write") {
      return (
        hasEffectiveCapability(user, "editPages") ||
        hasEffectiveCapability(user, "editCms")
      );
    }
    const capability = SCOPE_CAPABILITY[scope];
    return capability ? hasEffectiveCapability(user, capability) : false;
  });
}

export function assertMcpScopesAllowedForUser(
  user: SessionUser,
  scopes: readonly McpScope[],
): void {
  const allowed = filterMcpScopesForUser(user, scopes);
  if (allowed.length === 0) {
    throw new Error("No MCP scopes are available for your role");
  }
  if (allowed.length !== scopes.length) {
    throw new Error("Requested MCP scopes exceed your role");
  }
}

export function canUserRequestMcpScope(
  user: SessionUser,
  scope: McpScope,
): boolean {
  return filterMcpScopesForUser(user, [scope]).length === 1;
}
