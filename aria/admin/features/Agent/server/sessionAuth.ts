import { SESSION_COOKIE } from "../../../../lib/auth/types";
import { getAuthAdapterAsync } from "../../../../lib/auth/getAuthAdapter";
import type { SessionUser } from "../../../../lib/auth";
import type { AuthAdapter } from "../../../../lib/auth/adapter";
import type { RuntimeLocals } from "../../../../lib/cloudflare/env";
import { z } from "zod";

const AgentConnectionAuthStateSchema = z.looseObject({
  ariaAgentAuth: z.object({
    userId: z.uuid(),
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeAgentConnectionAuthState(
  state: unknown,
  userId: string,
): Record<string, unknown> {
  return AgentConnectionAuthStateSchema.parse({
    ...(isRecord(state) ? state : {}),
    ariaAgentAuth: { userId },
  });
}

export function getAgentConnectionUserId(state: unknown): string | null {
  const parsed = AgentConnectionAuthStateSchema.safeParse(state);
  return parsed.success ? parsed.data.ariaAgentAuth.userId : null;
}

export async function resolveSessionUserFromConnectionState(
  state: unknown,
  adapter: Pick<AuthAdapter, "getUserById">,
): Promise<SessionUser | null> {
  const userId = getAgentConnectionUserId(state);
  if (!userId) {
    return null;
  }

  return adapter.getUserById(userId);
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (!rawName) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rawValueParts.join("=")));
  }

  return cookies;
}

export function getSessionIdFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies.get(SESSION_COOKIE.NAME) ?? null;
}

export async function resolveSessionUserFromRequest(
  request: Request,
  locals: RuntimeLocals,
): Promise<SessionUser | null> {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) {
    return null;
  }

  const adapter = await getAuthAdapterAsync(locals);
  return adapter.getSessionUser(sessionId);
}
