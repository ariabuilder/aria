import { getAuthAdapterAsync } from "../../../../lib/auth";
import { getStorageAdapterAsync } from "../../../../lib/storage/getStorageAdapter";
import type { RuntimeLocals } from "../../../../lib/cloudflare/env";
import { AGENT_MCP_PATH, AGENT_WS_PATH_PREFIX } from "../lib/constants";
import { parseBearerToken, resolveMcpTokenAuth } from "../lib/mcp/tokenStore";
import { assertMcpScopesAllowedForUser } from "../lib/mcp/scopes";
import { mergeAgentSettings } from "../lib/schemas";
import { resolveSiteId, resolveAgentDoName } from "../lib/siteId";
import { handleMcpHttpRequest } from "./mcp/server";
import { resolveSessionUserFromRequest } from "./sessionAuth";
import type { AgentWorkerEnv } from "./AriaStudioAgent";
import { hasEffectiveCapability } from "../../../../lib/auth";

function createWorkerLocals(env: AgentWorkerEnv): RuntimeLocals {
  return { cfBindings: env };
}

export async function handleMcpRoute(
  request: Request,
  locals: RuntimeLocals | App.Locals,
): Promise<Response> {
  const storageAdapter = await getStorageAdapterAsync(locals);
  const siteSettings = await storageAdapter.getSiteSettings();
  if (!mergeAgentSettings(siteSettings?.agent, {}).mcpEnabled) {
    return new Response("MCP is disabled for this site", { status: 403 });
  }

  const bearer = parseBearerToken(request);
  if (!bearer) {
    return new Response("Missing Bearer token", { status: 401 });
  }

  const token = await resolveMcpTokenAuth({ locals, bearerToken: bearer });
  if (!token) {
    return new Response("Invalid or expired MCP token", { status: 401 });
  }

  const authAdapter = await getAuthAdapterAsync(locals);
  // Personal tokens act as their owner. Service tokens retain a concrete,
  // auditable principal by acting as the user who created them.
  const actorUser = await authAdapter.getUserById(
    token.userId ?? token.createdByUserId,
  );

  if (!actorUser) {
    return new Response("MCP token principal no longer exists", {
      status: 401,
    });
  }

  try {
    assertMcpScopesAllowedForUser(actorUser, token.scopes);
  } catch {
    return new Response("Token scopes exceed current user role", {
      status: 403,
    });
  }

  return handleMcpHttpRequest({
    request,
    actionContext: {
      locals,
      request,
      user: actorUser,
    },
    token,
    actorUser,
  });
}

export async function handleAgentRoutes(
  request: Request,
  env: AgentWorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);

  const locals = createWorkerLocals(env);

  if (
    url.pathname === AGENT_MCP_PATH ||
    url.pathname === `${AGENT_MCP_PATH}/`
  ) {
    return handleMcpRoute(request, locals);
  }

  if (!url.pathname.startsWith(AGENT_WS_PATH_PREFIX)) {
    return null;
  }

  const namespace = env.aria_studio_agent;
  if (!namespace) {
    return new Response("Agent durable object binding is not configured", {
      status: 503,
    });
  }

  const user = await resolveSessionUserFromRequest(request, locals);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!hasEffectiveCapability(user, "useStudioAgent")) {
    return new Response("Forbidden", { status: 403 });
  }

  const adapter = await getStorageAdapterAsync(locals);
  const siteSettings = await adapter.getSiteSettings();
  const siteId = resolveSiteId({ siteSettings, request });
  const doName = resolveAgentDoName({ siteId, userId: user.id });

  // Keep the Agents SDK out of the Node/MCP module graph. Its runtime imports
  // cloudflare:workers and is only valid when dispatching a Durable Object.
  const { getAgentByName } = await import("agents");
  const agent = await getAgentByName(namespace, doName);
  return agent.fetch(request);
}
