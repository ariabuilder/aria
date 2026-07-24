import type { AstroCookies } from "astro";

import {
  getAuthAdapterAsync,
  getSessionIdFromCookies,
  hasEffectiveCapability,
  type Capability,
  type SessionUser,
} from "../../../../aria/lib/auth";
import { readSessionUserFromLocals } from "../../../../aria/lib/runtime/requestLocals";

type AdminApiAuthInput = {
  locals: Parameters<typeof readSessionUserFromLocals>[0];
  cookies: AstroCookies;
};

export type AdminApiAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

function authResponse(message: string, status: 401 | 403): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function readAdminApiSessionUser(
  input: AdminApiAuthInput,
): Promise<SessionUser | null> {
  let sessionUser = readSessionUserFromLocals(input.locals);
  if (!sessionUser) {
    const sessionId = getSessionIdFromCookies(input.cookies);
    if (sessionId) {
      const authAdapter = await getAuthAdapterAsync(input.locals);
      sessionUser = await authAdapter.getSessionUser(sessionId);
    }
  }

  return sessionUser;
}

export async function requireAdminApiCapabilities(
  input: AdminApiAuthInput & { anyOf: Capability[] },
): Promise<AdminApiAuthResult> {
  const user = await readAdminApiSessionUser(input);
  if (!user) {
    return { ok: false, response: authResponse("Unauthorized", 401) };
  }

  const allowed = input.anyOf.some((capability) =>
    hasEffectiveCapability(user, capability),
  );

  if (!allowed) {
    return { ok: false, response: authResponse("Forbidden", 403) };
  }

  return { ok: true, user };
}
