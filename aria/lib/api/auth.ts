import type { ActionAPIContext } from "astro:actions";
import { getAuthAdapterAsync } from "../auth/getAuthAdapter";
import { SessionUserSchema, type SessionUser } from "../auth/types";
import type { RequestRuntimeLocals } from "../runtime/requestLocals";
import { getStorageAdapterAsync } from "../storage/getStorageAdapter";
import { createApiActionContext } from "./actionBridge";
import { readApiKeyring, parseRawApiToken, verifyApiValue } from "./crypto";
import { getApiSqlDatabase } from "./database";
import { ApiHttpError } from "./http";
import { ApiRepository } from "./repository";
import { SITE_API_AUDIENCE, type ApiCredential, type ApiScope } from "./schemas";
import type { StorageAdapter } from "../storage/adapter";

async function appendDeniedAudit(input: {
  storage: StorageAdapter;
  repository: ApiRepository;
  siteId: string;
  subject: string;
  requestId: string;
  credentialId?: string;
  actorId?: string;
  eventType: string;
  method: string;
  outcome: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const allowance = await input.storage.consumeRateLimit({
    scope: "site-api:security-audit",
    subject: input.subject,
    limit: 20,
    windowMs: 60_000,
  });
  if (!allowance.allowed) return;
  await input.repository.appendSecurityAudit(input);
}

export type AuthenticatedApiRequest = {
  credential: ApiCredential;
  user: SessionUser;
  siteId: string;
  repository: ApiRepository;
  actionContext: ActionAPIContext;
};

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization");
  const match = /^Bearer ([^\s]+)$/u.exec(authorization ?? "");
  if (!match?.[1]) {
    throw new ApiHttpError({
      status: 401,
      code: "unauthorized",
      message: "A valid Bearer credential is required",
      headers: { "WWW-Authenticate": 'Bearer realm="aria-site-api"' },
    });
  }
  return match[1];
}

export async function authenticateApiRequest(input: {
  request: Request;
  locals: RequestRuntimeLocals;
  requestId: string;
  requiredScopes: readonly ApiScope[];
}): Promise<AuthenticatedApiRequest> {
  // Reject syntactically invalid credentials before touching storage. This
  // keeps anonymous noise cheap; well-formed token failures are rate-limited
  // and audited after the site boundary is available.
  const rawToken = bearerToken(input.request);
  const parsedToken = parseRawApiToken(rawToken);
  if (!parsedToken) {
    throw new ApiHttpError({
      status: 401,
      code: "unauthorized",
      message: "Credential is invalid",
    });
  }
  const storage = await getStorageAdapterAsync(input.locals);
  // Local storage initialization owns migration application. D1 deployments
  // apply the same numbered migrations before the Worker is deployed.
  await storage.getSiteSettings();

  const repository = new ApiRepository(await getApiSqlDatabase(input.locals));
  const siteId = await repository.getOrCreateSiteIdentity();
  const now = Date.now();
  const siteLimit = await storage.consumeRateLimit({
    scope: "site-api:site",
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
  const credential = await repository.getCredentialByPrefix(parsedToken.prefix);
  const active =
    credential &&
    credential.siteId === siteId &&
    credential.audience === SITE_API_AUDIENCE &&
    credential.revokedAt === null &&
    (credential.expiresAt === null || Date.parse(credential.expiresAt) > now);
  const validDigest = active
    ? await verifyApiValue(
        readApiKeyring(input.locals, credential.keyId),
        "credential",
        parsedToken.token,
        credential.tokenDigest,
      )
    : false;
  if (!credential || !active || !validDigest) {
    await appendDeniedAudit({
      storage,
      repository,
      requestId: input.requestId,
      siteId,
      subject: credential?.id ?? siteId,
      credentialId: credential?.id,
      actorId: credential?.principalId,
      eventType: "authentication",
      method: input.request.method,
      outcome: "invalid_credential",
    });
    throw new ApiHttpError({
      status: 401,
      code: "unauthorized",
      message: "Credential is invalid or expired",
    });
  }

  const credentialLimit = await storage.consumeRateLimit({
    scope: "site-api:credential",
    subject: credential.id,
    limit: 300,
    windowMs: 60_000,
  });
  if (!credentialLimit.allowed) {
    throw new ApiHttpError({
      status: 429,
      code: "rate_limited",
      message: "Rate limit exceeded",
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((credentialLimit.resetAt - now) / 1_000)),
        ),
      },
    });
  }

  for (const required of input.requiredScopes) {
    if (!credential.scopes.includes(required)) {
      await appendDeniedAudit({
        storage,
        repository,
        requestId: input.requestId,
        siteId,
        subject: credential.id,
        credentialId: credential.id,
        actorId: credential.principalId,
        eventType: "authorization",
        method: input.request.method,
        outcome: "missing_scope",
        metadata: { requiredScope: required },
      });
      throw new ApiHttpError({
        status: 403,
        code: "forbidden",
        message: `Credential is missing required scope: ${required}`,
      });
    }
  }

  const userRecord = await (await getAuthAdapterAsync(input.locals)).getUserById(
    credential.principalId,
  );
  const user = SessionUserSchema.safeParse(userRecord);
  if (!user.success) {
    throw new ApiHttpError({
      status: 401,
      code: "unauthorized",
      message: "Credential principal is unavailable",
    });
  }
  await repository.touchCredential(credential.id);
  return {
    credential,
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
