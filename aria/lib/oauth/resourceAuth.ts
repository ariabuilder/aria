import type { ActionAPIContext } from "astro:actions";

import { getAuthAdapterAsync } from "../auth/getAuthAdapter";
import { SessionUserSchema, type SessionUser } from "../auth/types";
import { createApiActionContext } from "../api/actionBridge";
import { readApiKeyring, verifyApiValue } from "../api/crypto";
import { getApiSqlDatabase } from "../api/database";
import { ApiHttpError } from "../api/http";
import { ApiRepository } from "../api/repository";
import type { RequestRuntimeLocals } from "../runtime/requestLocals";
import type { StorageAdapter } from "../storage/adapter";
import { getStorageAdapterAsync } from "../storage/getStorageAdapter";
import { parseOAuthAccessToken } from "./codes";
import {
  assertCanonicalOAuthRequest,
  FIGMA_OAUTH_CLIENT_ID,
  OAUTH_ACCESS_AUDIENCE,
  readOAuthConfiguration,
} from "./config";
import { hasCurrentFigmaScopeCapability } from "./permissions";
import { OAuthRepository, type OAuthAccessTokenRecord } from "./repository";
import type { FigmaOAuthScope } from "./schemas";

export type AuthenticatedFigmaOAuthRequest = Readonly<{
  accessToken: OAuthAccessTokenRecord;
  user: SessionUser;
  siteId: string;
  repository: OAuthRepository;
  actionContext: ActionAPIContext;
}>;

function bearerChallenge(
  error: "invalid_token" | "insufficient_scope",
  scope?: FigmaOAuthScope,
): string {
  return [
    'Bearer realm="aria-figma-api"',
    `error="${error}"`,
    ...(scope ? [`scope="${scope}"`] : []),
  ].join(", ");
}

function invalidToken(): ApiHttpError {
  return new ApiHttpError({
    status: 401,
    code: "unauthorized",
    message: "OAuth access token is invalid or expired",
    headers: { "WWW-Authenticate": bearerChallenge("invalid_token") },
  });
}

function bearerToken(request: Request): string {
  if (request.headers.has("Cookie")) {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "Cookie credentials are not accepted on Figma API routes",
    });
  }
  const match = /^Bearer ([^\s]+)$/iu.exec(
    request.headers.get("Authorization") ?? "",
  );
  if (!match?.[1]) throw invalidToken();
  return match[1];
}

async function appendDeniedAudit(input: {
  storage: StorageAdapter;
  repository: OAuthRepository;
  siteId: string;
  requestId: string;
  method: string;
  outcome:
    | "invalid_token"
    | "missing_scope"
    | "principal_unavailable"
    | "capability_denied";
  accessTokenId?: string;
  actorId?: string;
  requiredScope?: FigmaOAuthScope;
}): Promise<void> {
  const allowance = await input.storage.consumeRateLimit({
    scope: "oauth-resource:security-audit",
    subject: input.accessTokenId ?? input.siteId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!allowance.allowed) return;
  await input.repository.appendResourceAudit({
    requestId: input.requestId,
    siteId: input.siteId,
    actorId: input.actorId,
    accessTokenId: input.accessTokenId,
    method: input.method,
    outcome: input.outcome,
    requiredScope: input.requiredScope,
  });
}

export async function authenticateFigmaOAuthRequest(input: {
  request: Request;
  locals: RequestRuntimeLocals;
  requestId: string;
  requiredScopes: readonly FigmaOAuthScope[];
}): Promise<AuthenticatedFigmaOAuthRequest> {
  const rawToken = bearerToken(input.request);
  const parsedToken = parseOAuthAccessToken(rawToken);
  if (!parsedToken) throw invalidToken();
  try {
    assertCanonicalOAuthRequest(
      input.request,
      readOAuthConfiguration(input.locals),
    );
  } catch {
    throw invalidToken();
  }

  const storage = await getStorageAdapterAsync(input.locals);
  await storage.getSiteSettings();
  const database = await getApiSqlDatabase(input.locals);
  const apiRepository = new ApiRepository(database);
  const repository = new OAuthRepository(database);
  const siteId = await apiRepository.getOrCreateSiteIdentity();
  const now = Date.now();
  const siteLimit = await storage.consumeRateLimit({
    scope: "oauth-resource:site",
    subject: siteId,
    limit: 1_200,
    windowMs: 60_000,
  });
  if (!siteLimit.allowed) {
    throw new ApiHttpError({
      status: 429,
      code: "rate_limited",
      message: "Rate limit exceeded",
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((siteLimit.resetAt - now) / 1_000)),
        ),
      },
    });
  }

  const accessToken = await repository.findAccessTokenByPrefix(
    parsedToken.prefix,
  );
  const active =
    accessToken?.siteId === siteId &&
    accessToken.clientId === FIGMA_OAUTH_CLIENT_ID &&
    accessToken.audience === OAUTH_ACCESS_AUDIENCE &&
    accessToken.revokedAt === null &&
    Date.parse(accessToken.expiresAt) > now &&
    accessToken.authorityConsistent &&
    accessToken.clientStatus === "active" &&
    accessToken.grantStatus === "active" &&
    accessToken.refreshFamilyId !== null &&
    accessToken.refreshFamilyStatus === "active" &&
    accessToken.refreshFamilyExpiresAt !== null &&
    Date.parse(accessToken.refreshFamilyExpiresAt) > now;
  const validDigest = active
    ? await verifyApiValue(
        readApiKeyring(input.locals, accessToken.keyId),
        "oauth-access",
        parsedToken.token,
        accessToken.tokenDigest,
      )
    : false;
  if (!accessToken || !active || !validDigest) {
    await appendDeniedAudit({
      storage,
      repository,
      siteId,
      requestId: input.requestId,
      method: input.request.method,
      outcome: "invalid_token",
      accessTokenId: accessToken?.id,
      actorId: accessToken?.principalId,
    });
    throw invalidToken();
  }

  const tokenLimit = await storage.consumeRateLimit({
    scope: "oauth-resource:access-token",
    subject: accessToken.id,
    limit: 300,
    windowMs: 60_000,
  });
  if (!tokenLimit.allowed) {
    throw new ApiHttpError({
      status: 429,
      code: "rate_limited",
      message: "Rate limit exceeded",
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((tokenLimit.resetAt - now) / 1_000)),
        ),
      },
    });
  }

  for (const requiredScope of input.requiredScopes) {
    if (
      !accessToken.scopes.includes(requiredScope) ||
      !accessToken.grantScopes.includes(requiredScope) ||
      !accessToken.clientAllowedScopes.includes(requiredScope)
    ) {
      await appendDeniedAudit({
        storage,
        repository,
        siteId,
        requestId: input.requestId,
        method: input.request.method,
        outcome: "missing_scope",
        accessTokenId: accessToken.id,
        actorId: accessToken.principalId,
        requiredScope,
      });
      throw new ApiHttpError({
        status: 403,
        code: "forbidden",
        message: `OAuth access token is missing required scope: ${requiredScope}`,
        headers: {
          "WWW-Authenticate": bearerChallenge(
            "insufficient_scope",
            requiredScope,
          ),
        },
      });
    }
  }

  const userRecord = await (
    await getAuthAdapterAsync(input.locals)
  ).getUserById(accessToken.principalId);
  const user = SessionUserSchema.safeParse(userRecord);
  if (!user.success || user.data.id !== accessToken.principalId) {
    await appendDeniedAudit({
      storage,
      repository,
      siteId,
      requestId: input.requestId,
      method: input.request.method,
      outcome: "principal_unavailable",
      accessTokenId: accessToken.id,
      actorId: accessToken.principalId,
    });
    throw invalidToken();
  }

  for (const requiredScope of input.requiredScopes) {
    if (!hasCurrentFigmaScopeCapability(user.data, requiredScope)) {
      await appendDeniedAudit({
        storage,
        repository,
        siteId,
        requestId: input.requestId,
        method: input.request.method,
        outcome: "capability_denied",
        accessTokenId: accessToken.id,
        actorId: accessToken.principalId,
        requiredScope,
      });
      throw new ApiHttpError({
        status: 403,
        code: "forbidden",
        message: "Current site permissions do not allow this operation",
        headers: {
          "WWW-Authenticate": bearerChallenge(
            "insufficient_scope",
            requiredScope,
          ),
        },
      });
    }
  }

  await repository.touchAccessToken(accessToken.id);
  return {
    accessToken,
    user: user.data,
    siteId,
    repository,
    actionContext: createApiActionContext({
      request: input.request,
      locals: input.locals,
      user: user.data,
    }),
  };
}
