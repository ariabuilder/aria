import { hmacApiValue, readApiKeyring, verifyApiValue } from "../api/crypto";
import { getApiSqlDatabase } from "../api/database";
import { ApiRepository } from "../api/repository";
import type { RuntimeLocals } from "../cloudflare/env";
import { getStorageAdapterAsync } from "../storage/getStorageAdapter";
import {
  createOAuthAccessToken,
  createOAuthRefreshToken,
  parseOAuthAccessToken,
  parseOAuthRefreshToken,
} from "./codes";
import { FIGMA_OAUTH_CLIENT_ID } from "./config";
import { OAuthProtocolError } from "./http";
import { OAuthRepository } from "./repository";

const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1_000;

async function oauthRepositories(locals: RuntimeLocals) {
  const storage = await getStorageAdapterAsync(locals);
  await storage.getSiteSettings();
  const database = await getApiSqlDatabase(locals);
  const api = new ApiRepository(database);
  const oauth = new OAuthRepository(database);
  const siteId = await api.getOrCreateSiteIdentity();
  await oauth.ensureBuiltInFigmaClient(siteId);
  return { oauth, siteId };
}

function invalidGrant(): OAuthProtocolError {
  return new OAuthProtocolError(
    "invalid_grant",
    400,
    "Refresh token is invalid",
  );
}

export async function exchangeRefreshToken(input: {
  locals: RuntimeLocals;
  clientId: string;
  refreshToken: string;
  now?: Date;
}) {
  if (input.clientId !== FIGMA_OAUTH_CLIENT_ID) {
    throw new OAuthProtocolError(
      "invalid_client",
      401,
      "Client is unavailable",
    );
  }
  const parsed = parseOAuthRefreshToken(input.refreshToken);
  if (!parsed) throw invalidGrant();

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { oauth, siteId } = await oauthRepositories(input.locals);
  const stored = await oauth.findRefreshTokenByPrefix(parsed.prefix);
  if (
    !stored ||
    stored.siteId !== siteId ||
    stored.clientId !== input.clientId
  ) {
    throw invalidGrant();
  }
  const verificationKeyring = readApiKeyring(input.locals, stored.keyId);
  if (
    !(await verifyApiValue(
      verificationKeyring,
      "oauth-refresh",
      parsed.token,
      stored.tokenDigest,
    ))
  ) {
    throw invalidGrant();
  }

  if (stored.consumedAt) {
    await oauth.revokeRefreshFamily({
      familyId: stored.familyId,
      reason: "refresh_reuse",
      now: nowIso,
    });
    throw invalidGrant();
  }
  if (
    stored.revokedAt ||
    stored.familyStatus !== "active" ||
    stored.grantStatus !== "active" ||
    stored.clientStatus !== "active" ||
    stored.generation !== stored.currentGeneration ||
    Date.parse(stored.expiresAt) <= now.getTime() ||
    Date.parse(stored.absoluteExpiresAt) <= now.getTime()
  ) {
    throw invalidGrant();
  }

  const activeKeyring = readApiKeyring(input.locals);
  const refresh = createOAuthRefreshToken();
  const access = createOAuthAccessToken();
  const accessExpiresAt = new Date(
    Math.min(
      now.getTime() + ACCESS_TOKEN_LIFETIME_MS,
      Date.parse(stored.absoluteExpiresAt),
    ),
  ).toISOString();
  const rotated = await oauth.rotateRefreshToken({
    tokenId: stored.id,
    familyId: stored.familyId,
    generation: stored.generation,
    newRefreshTokenId: crypto.randomUUID(),
    newRefreshTokenPrefix: refresh.prefix,
    newRefreshTokenDigest: await hmacApiValue(
      activeKeyring,
      "oauth-refresh",
      refresh.token,
    ),
    newRefreshTokenKeyId: activeKeyring.keyId,
    newRefreshTokenExpiresAt: stored.absoluteExpiresAt,
    accessTokenId: crypto.randomUUID(),
    accessTokenPrefix: access.prefix,
    accessTokenDigest: await hmacApiValue(
      activeKeyring,
      "oauth-access",
      access.token,
    ),
    accessTokenKeyId: activeKeyring.keyId,
    accessTokenExpiresAt: accessExpiresAt,
    now: nowIso,
  });
  if (!rotated) {
    await oauth.revokeRefreshFamily({
      familyId: stored.familyId,
      reason: "refresh_reuse",
      now: nowIso,
    });
    throw invalidGrant();
  }

  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: Math.max(
      0,
      Math.floor((Date.parse(accessExpiresAt) - now.getTime()) / 1_000),
    ),
    refresh_token: refresh.token,
    scope: stored.scopes.join(" "),
  };
}

export async function revokeOAuthToken(input: {
  locals: RuntimeLocals;
  clientId: string;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
  now?: Date;
}): Promise<void> {
  if (input.clientId !== FIGMA_OAUTH_CLIENT_ID) return;
  const nowIso = (input.now ?? new Date()).toISOString();
  const { oauth, siteId } = await oauthRepositories(input.locals);

  // RFC 7009 defines the hint as advisory. Opaque token prefixes already tell
  // us the token kind, so a stale or incorrect hint must not block revocation.
  const refresh = parseOAuthRefreshToken(input.token);
  if (refresh) {
    const stored = await oauth.findRefreshTokenByPrefix(refresh.prefix);
    if (
      stored?.siteId === siteId &&
      stored.clientId === input.clientId &&
      (await verifyApiValue(
        readApiKeyring(input.locals, stored.keyId),
        "oauth-refresh",
        refresh.token,
        stored.tokenDigest,
      ))
    ) {
      await oauth.revokeRefreshFamily({
        familyId: stored.familyId,
        reason: "token_revocation",
        now: nowIso,
      });
    }
    return;
  }

  const access = parseOAuthAccessToken(input.token);
  if (access) {
    const stored = await oauth.findAccessTokenByPrefix(access.prefix);
    if (
      stored?.siteId === siteId &&
      stored.clientId === input.clientId &&
      (await verifyApiValue(
        readApiKeyring(input.locals, stored.keyId),
        "oauth-access",
        access.token,
        stored.tokenDigest,
      ))
    ) {
      await oauth.revokeAccessToken(stored.id, nowIso);
    }
  }
}
