import type { RuntimeLocals } from "../cloudflare/env";
import {
  hmacApiValue,
  listAvailableApiKeyringIds,
  readApiKeyring,
  verifyApiValue,
} from "../api/crypto";
import { getApiSqlDatabase } from "../api/database";
import { ApiRepository } from "../api/repository";
import { getStorageAdapterAsync } from "../storage/getStorageAdapter";
import {
  createOAuthAccessToken,
  createOAuthDeviceCode,
  createOAuthRefreshToken,
  createOAuthUserCode,
  parseOAuthDeviceCode,
} from "./codes";
import { OAuthProtocolError } from "./http";
import { OAuthRepository, type OAuthDeviceAuthorization } from "./repository";
import { FIGMA_OAUTH_CLIENT_ID, type OAuthConfiguration } from "./config";
import { normalizeUserCode, type FigmaOAuthScope } from "./schemas";

const DEVICE_LIFETIME_MS = 10 * 60 * 1_000;
const DEVICE_POLL_INTERVAL_SECONDS = 5;
const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1_000;
const REFRESH_TOKEN_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const EXCHANGE_LEASE_MS = 30 * 1_000;

async function oauthRepositories(locals: RuntimeLocals) {
  const storage = await getStorageAdapterAsync(locals);
  await storage.getSiteSettings();
  const database = await getApiSqlDatabase(locals);
  const api = new ApiRepository(database);
  const oauth = new OAuthRepository(database);
  const siteId = await api.getOrCreateSiteIdentity();
  await oauth.ensureBuiltInFigmaClient(siteId);
  return { storage, oauth, siteId };
}

export async function createDeviceAuthorization(input: {
  locals: RuntimeLocals;
  configuration: OAuthConfiguration;
  clientId: string;
  scopes: readonly FigmaOAuthScope[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { oauth, siteId } = await oauthRepositories(input.locals);
  if (!(await oauth.isActiveClient(siteId, input.clientId))) {
    throw new OAuthProtocolError(
      "invalid_client",
      401,
      "Client is unavailable",
    );
  }
  const keyring = readApiKeyring(input.locals);
  const device = createOAuthDeviceCode();
  const userCode = createOAuthUserCode();
  await oauth.createDeviceAuthorization({
    id: crypto.randomUUID(),
    siteId,
    clientId: input.clientId,
    deviceCodePrefix: device.prefix,
    deviceCodeDigest: await hmacApiValue(keyring, "oauth-device", device.code),
    deviceCodeKeyId: keyring.keyId,
    userCodeDigest: await hmacApiValue(
      keyring,
      "oauth-user-code",
      normalizeUserCode(userCode),
    ),
    userCodeKeyId: keyring.keyId,
    requestedScopes: input.scopes,
    intervalSeconds: DEVICE_POLL_INTERVAL_SECONDS,
    expiresAt: new Date(now.getTime() + DEVICE_LIFETIME_MS).toISOString(),
    now: nowIso,
  });
  return {
    device_code: device.code,
    user_code: userCode,
    verification_uri: `${input.configuration.canonicalOrigin}/oauth/device`,
    expires_in: DEVICE_LIFETIME_MS / 1_000,
    interval: DEVICE_POLL_INTERVAL_SECONDS,
  };
}

export async function inspectDeviceUserCode(input: {
  locals: RuntimeLocals;
  userCode: string;
  now?: Date;
}): Promise<OAuthDeviceAuthorization> {
  const now = input.now ?? new Date();
  const normalized = normalizeUserCode(input.userCode);
  if (normalized.length !== 8) {
    throw new OAuthProtocolError("invalid_user_code", 404, "Code not found");
  }
  const { oauth } = await oauthRepositories(input.locals);
  let device: OAuthDeviceAuthorization | null = null;
  for (const keyId of listAvailableApiKeyringIds(input.locals)) {
    let keyring;
    try {
      keyring = readApiKeyring(input.locals, keyId);
    } catch {
      continue;
    }
    const digest = await hmacApiValue(keyring, "oauth-user-code", normalized);
    device = await oauth.findDeviceByUserDigest(digest, keyring.keyId);
    if (device) break;
  }
  if (!device) {
    throw new OAuthProtocolError("invalid_user_code", 404, "Code not found");
  }
  if (Date.parse(device.expiresAt) <= now.getTime()) {
    await oauth.expireDevice(device.id, now.toISOString());
    throw new OAuthProtocolError("expired_token", 410, "Code expired");
  }
  if (device.state !== "pending") {
    throw new OAuthProtocolError(
      "invalid_user_code",
      409,
      "Code is no longer pending",
    );
  }
  return device;
}

export async function decideDeviceAuthorization(input: {
  locals: RuntimeLocals;
  userCode: string;
  principalId: string;
  decision: "approve" | "deny";
  scopes?: readonly FigmaOAuthScope[];
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const device = await inspectDeviceUserCode({
    locals: input.locals,
    userCode: input.userCode,
    now,
  });
  const { oauth } = await oauthRepositories(input.locals);
  if (input.decision === "deny") {
    return oauth.denyDevice(device.id, now.toISOString());
  }
  const scopes = [...new Set(input.scopes ?? [])].sort();
  if (
    scopes.length === 0 ||
    scopes.some((scope) => !device.requestedScopes.includes(scope))
  ) {
    throw new OAuthProtocolError(
      "invalid_scope",
      400,
      "Approved scopes must be a non-empty subset of requested scopes",
    );
  }
  return oauth.approveDevice({
    id: device.id,
    principalId: input.principalId,
    scopes,
    now: now.toISOString(),
  });
}

export async function exchangeDeviceCode(input: {
  locals: RuntimeLocals;
  clientId: string;
  deviceCode: string;
  now?: Date;
}) {
  if (input.clientId !== FIGMA_OAUTH_CLIENT_ID) {
    throw new OAuthProtocolError(
      "invalid_client",
      401,
      "Client is unavailable",
    );
  }
  const parsedCode = parseOAuthDeviceCode(input.deviceCode);
  if (!parsedCode) {
    throw new OAuthProtocolError(
      "invalid_grant",
      400,
      "Device code is invalid",
    );
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { oauth, siteId } = await oauthRepositories(input.locals);
  let device = await oauth.findDeviceByPrefix(parsedCode.prefix);
  if (
    !device ||
    device.siteId !== siteId ||
    device.clientId !== input.clientId
  ) {
    throw new OAuthProtocolError(
      "invalid_grant",
      400,
      "Device code is invalid",
    );
  }
  const keyring = readApiKeyring(input.locals, device.deviceCodeKeyId);
  if (
    !(await verifyApiValue(
      keyring,
      "oauth-device",
      parsedCode.code,
      device.deviceCodeDigest,
    ))
  ) {
    throw new OAuthProtocolError(
      "invalid_grant",
      400,
      "Device code is invalid",
    );
  }
  if (Date.parse(device.expiresAt) <= now.getTime()) {
    await oauth.expireDevice(device.id, nowIso);
    throw new OAuthProtocolError("expired_token", 400);
  }
  if (device.state === "denied") {
    throw new OAuthProtocolError("access_denied", 400);
  }
  if (device.state === "consumed" || device.state === "expired") {
    throw new OAuthProtocolError("expired_token", 400);
  }
  const nextPoll = new Date(
    now.getTime() + device.intervalSeconds * 1_000,
  ).toISOString();
  if (Date.parse(device.nextPollAt) > now.getTime()) {
    await oauth.slowDownPoll({
      id: device.id,
      now: nowIso,
      nextPollAt: new Date(
        now.getTime() + (device.intervalSeconds + 5) * 1_000,
      ).toISOString(),
    });
    throw new OAuthProtocolError("slow_down", 400);
  }
  if (
    !(await oauth.claimPoll({
      id: device.id,
      now: nowIso,
      nextPollAt: nextPoll,
    }))
  ) {
    throw new OAuthProtocolError("slow_down", 400);
  }
  if (device.state === "pending") {
    throw new OAuthProtocolError("authorization_pending", 400);
  }
  if (!device.principalId || !device.approvedScopes) {
    throw new OAuthProtocolError("server_error", 500);
  }
  const exchangeLeaseToken = crypto.randomUUID();
  if (
    !(await oauth.claimApprovedExchange({
      id: device.id,
      leaseToken: exchangeLeaseToken,
      leaseExpiresAt: new Date(now.getTime() + EXCHANGE_LEASE_MS).toISOString(),
      now: nowIso,
    }))
  ) {
    throw new OAuthProtocolError("authorization_pending", 400);
  }
  const access = createOAuthAccessToken();
  const refresh = createOAuthRefreshToken();
  const activeKeyring = readApiKeyring(input.locals);
  const accessExpiresAt = new Date(
    now.getTime() + ACCESS_TOKEN_LIFETIME_MS,
  ).toISOString();
  const refreshExpiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_ABSOLUTE_LIFETIME_MS,
  ).toISOString();
  await oauth.finalizeDeviceExchange({
    deviceId: device.id,
    exchangeLeaseToken,
    siteId,
    clientId: device.clientId,
    proposedGrantId: crypto.randomUUID(),
    principalId: device.principalId,
    scopes: device.approvedScopes,
    refreshFamilyId: crypto.randomUUID(),
    refreshFamilyExpiresAt: refreshExpiresAt,
    refreshTokenId: crypto.randomUUID(),
    refreshTokenPrefix: refresh.prefix,
    refreshTokenDigest: await hmacApiValue(
      activeKeyring,
      "oauth-refresh",
      refresh.token,
    ),
    refreshTokenKeyId: activeKeyring.keyId,
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
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_LIFETIME_MS / 1_000,
    refresh_token: refresh.token,
    scope: device.approvedScopes.join(" "),
  };
}
