import type { APIContext, APIRoute } from "astro";
import { z } from "zod";

import {
  getAuthAdapterAsync,
  getSessionIdFromCookies,
} from "../../../aria/lib/auth";
import { getClientIp } from "../../../aria/lib/auth/session";
import { getStorageAdapterAsync } from "../../../aria/lib/storage/getStorageAdapter";
import {
  assertCanonicalOAuthRequest,
  readOAuthConfiguration,
} from "../../../aria/lib/oauth/config";
import {
  createDeviceAuthorization,
  decideDeviceAuthorization,
  exchangeDeviceCode,
  inspectDeviceUserCode,
} from "../../../aria/lib/oauth/deviceFlow";
import {
  oauthEmptyResponse,
  oauthErrorResponse,
  oauthJson,
  OAuthProtocolError,
  publicOAuthOptions,
  readOAuthRequestBody,
} from "../../../aria/lib/oauth/http";
import {
  DeviceAuthorizationInputSchema,
  DeviceTokenInputSchema,
  FigmaOAuthScopeSchema,
  parseFigmaScopeString,
  RefreshTokenInputSchema,
  RevokeTokenInputSchema,
} from "../../../aria/lib/oauth/schemas";
import {
  exchangeRefreshToken,
  revokeOAuthToken,
} from "../../../aria/lib/oauth/tokenFlow";
import { hasCurrentFigmaScopeCapability } from "../../../aria/lib/oauth/permissions";

const CodeSchema = z.object({ user_code: z.string().min(1).max(16) }).strict();
const ApproveSchema = CodeSchema.extend({
  scopes: z.array(FigmaOAuthScopeSchema).min(1).max(3),
}).strict();

function protocol(context: APIContext): void {
  assertCanonicalOAuthRequest(
    context.request,
    readOAuthConfiguration(context.locals),
  );
}

async function sessionUser(context: APIContext) {
  if (context.request.headers.get("origin") !== context.url.origin) {
    throw new OAuthProtocolError("access_denied", 403);
  }
  const sessionId = getSessionIdFromCookies(context.cookies);
  const user = sessionId
    ? await (
        await getAuthAdapterAsync(context.locals)
      ).getSessionUser(sessionId)
    : null;
  if (!user) throw new OAuthProtocolError("access_denied", 401);
  const allowance = await (
    await getStorageAdapterAsync(context.locals)
  ).consumeRateLimit({
    scope: "oauth:user-code",
    subject: `${user.id}:${getClientIp(context.request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!allowance.allowed) throw new OAuthProtocolError("slow_down", 429);
  return user;
}

export const OPTIONS: APIRoute = ({ params }) =>
  params.path === "device/authorization" ||
  params.path === "token" ||
  params.path === "revoke"
    ? publicOAuthOptions()
    : new Response(null, { status: 404 });

export const GET: APIRoute = async (context) => {
  if (context.params.path !== "device")
    return new Response("Not found", { status: 404 });
  try {
    protocol(context);
    const sessionId = getSessionIdFromCookies(context.cookies);
    const user = sessionId
      ? await (
          await getAuthAdapterAsync(context.locals)
        ).getSessionUser(sessionId)
      : null;
    if (!user) {
      return new Response(
        "Sign in to this site, then reopen the Figma connection page.",
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return new Response(null, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        Location: "/oauth-device.html",
      },
    });
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const path = context.params.path;
  const cors =
    path === "device/authorization" || path === "token" || path === "revoke";
  try {
    protocol(context);
    const body = await readOAuthRequestBody(context.request);
    if (path === "device/authorization") {
      const parsed = DeviceAuthorizationInputSchema.safeParse(body);
      if (!parsed.success) throw new OAuthProtocolError("invalid_request", 400);
      let scopes;
      try {
        scopes = parseFigmaScopeString(parsed.data.scope);
      } catch {
        throw new OAuthProtocolError("invalid_scope", 400);
      }
      const storage = await getStorageAdapterAsync(context.locals);
      await storage.getSiteSettings();
      const allowance = await storage.consumeRateLimit({
        scope: "oauth:device-authorization",
        subject: `${parsed.data.client_id}:${getClientIp(context.request)}`,
        limit: 30,
        windowMs: 60_000,
      });
      if (!allowance.allowed) throw new OAuthProtocolError("slow_down", 429);
      return oauthJson(
        await createDeviceAuthorization({
          locals: context.locals,
          configuration: readOAuthConfiguration(context.locals),
          clientId: parsed.data.client_id,
          scopes,
        }),
        { cors: true },
      );
    }
    if (path === "token") {
      if (body.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
        const parsed = DeviceTokenInputSchema.safeParse(body);
        if (!parsed.success)
          throw new OAuthProtocolError("invalid_request", 400);
        return oauthJson(
          await exchangeDeviceCode({
            locals: context.locals,
            clientId: parsed.data.client_id,
            deviceCode: parsed.data.device_code,
          }),
          { cors: true },
        );
      }
      if (body.grant_type === "refresh_token") {
        const parsed = RefreshTokenInputSchema.safeParse(body);
        if (!parsed.success)
          throw new OAuthProtocolError("invalid_request", 400);
        const storage = await getStorageAdapterAsync(context.locals);
        const allowance = await storage.consumeRateLimit({
          scope: "oauth:refresh-token",
          subject: `${parsed.data.client_id}:${getClientIp(context.request)}`,
          limit: 60,
          windowMs: 60_000,
        });
        if (!allowance.allowed) throw new OAuthProtocolError("slow_down", 429);
        return oauthJson(
          await exchangeRefreshToken({
            locals: context.locals,
            clientId: parsed.data.client_id,
            refreshToken: parsed.data.refresh_token,
          }),
          { cors: true },
        );
      }
      throw new OAuthProtocolError(
        typeof body.grant_type === "string"
          ? "unsupported_grant_type"
          : "invalid_request",
        400,
      );
    }
    if (path === "revoke") {
      const parsed = RevokeTokenInputSchema.safeParse(body);
      if (!parsed.success) {
        throw new OAuthProtocolError("invalid_request", 400);
      }
      const storage = await getStorageAdapterAsync(context.locals);
      const allowance = await storage.consumeRateLimit({
        scope: "oauth:revoke-token",
        subject: `${parsed.data.client_id}:${getClientIp(context.request)}`,
        limit: 60,
        windowMs: 60_000,
      });
      if (!allowance.allowed) throw new OAuthProtocolError("slow_down", 429);
      await revokeOAuthToken({
        locals: context.locals,
        clientId: parsed.data.client_id,
        token: parsed.data.token,
        tokenTypeHint: parsed.data.token_type_hint,
      });
      return oauthEmptyResponse({ cors: true });
    }
    const actionMatch = /^device\/(inspect|approve|deny)$/u.exec(path ?? "");
    if (!actionMatch?.[1]) {
      throw new OAuthProtocolError("invalid_request", 404);
    }
    const action = actionMatch[1] as "inspect" | "approve" | "deny";
    const user = await sessionUser(context);
    if (action === "inspect") {
      const parsed = CodeSchema.safeParse(body);
      if (!parsed.success) throw new OAuthProtocolError("invalid_request", 400);
      const device = await inspectDeviceUserCode({
        locals: context.locals,
        userCode: parsed.data.user_code,
      });
      return oauthJson({
        client: { id: device.clientId, name: device.clientName },
        scopes: device.requestedScopes,
        expiresAt: device.expiresAt,
      });
    }
    if (action === "deny") {
      const parsed = CodeSchema.safeParse(body);
      if (!parsed.success) throw new OAuthProtocolError("invalid_request", 400);
      return oauthJson({
        denied: await decideDeviceAuthorization({
          locals: context.locals,
          userCode: parsed.data.user_code,
          principalId: user.id,
          decision: "deny",
        }),
      });
    }
    const approval = ApproveSchema.safeParse(body);
    if (!approval.success) throw new OAuthProtocolError("invalid_request", 400);
    const allowed = approval.data.scopes.every((scope) =>
      hasCurrentFigmaScopeCapability(user, scope),
    );
    if (!allowed) {
      throw new OAuthProtocolError(
        "invalid_scope",
        403,
        "One or more scopes exceed your current site permissions",
      );
    }
    return oauthJson({
      approved: await decideDeviceAuthorization({
        locals: context.locals,
        userCode: approval.data.user_code,
        principalId: user.id,
        decision: "approve",
        scopes: approval.data.scopes,
      }),
    });
  } catch (cause) {
    return oauthErrorResponse(cause, { cors });
  }
};
