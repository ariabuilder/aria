import { hasEffectiveCapability } from "../../../../../lib/auth";
import type { AgentShellContext } from "../schemas";
import type { AgentToolActionContext, ToolContext } from "./types";

export function buildToolContext(
  transport: ToolContext["transport"],
  actionContext: AgentToolActionContext,
  shellContext?: AgentShellContext,
  siteId = "default",
): ToolContext {
  const scopes: ToolContext["scopes"] = ["mcp:read"];
  if (canAgentWritePages(actionContext)) {
    scopes.push("mcp:write");
  }
  if (canAgentWriteDesignSystem(actionContext)) {
    scopes.push("mcp:design");
  }
  if (canAgentPublishPages(actionContext)) {
    scopes.push("mcp:publish");
  }

  return {
    transport,
    userId: actionContext.user?.id ?? null,
    siteId,
    scopes,
    shellContext,
    actorLabel: actionContext.user?.id ?? "studio",
  };
}

export function canAgentWriteDesignSystem(
  actionContext: AgentToolActionContext,
): boolean {
  return (
    actionContext.user != null &&
    hasEffectiveCapability(actionContext.user, "editSiteSettings")
  );
}

export function canAgentWritePages(
  actionContext: AgentToolActionContext,
): boolean {
  return (
    actionContext.user != null &&
    hasEffectiveCapability(actionContext.user, "editPages")
  );
}

export function canAgentWriteCms(
  actionContext: AgentToolActionContext,
): boolean {
  return (
    actionContext.user != null &&
    hasEffectiveCapability(actionContext.user, "editCms")
  );
}

export function canAgentPublishPages(
  actionContext: AgentToolActionContext,
): boolean {
  return (
    actionContext.user != null &&
    hasEffectiveCapability(actionContext.user, "publishContent")
  );
}
