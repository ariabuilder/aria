import { z } from "zod";
import {
  getCloudflareEnv,
  getStringRuntimeSetting,
  type RuntimeLocals,
} from "../cloudflare/env";

const KeyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u);
const TOKEN_PATTERN = /^aria_api_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/u;
const NUMBERED_KEYRING_SECRET_PATTERN =
  /^ARIA_API_KEYRING_KEY_([A-Za-z0-9_-]+)$/u;
const encoder = new TextEncoder();

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return ownedBytes(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

export type ApiKeyring = Readonly<{
  keyId: string;
  rootKey: Uint8Array<ArrayBuffer>;
}>;

export function readApiKeyring(
  locals?: RuntimeLocals,
  requestedKeyId?: string,
): ApiKeyring {
  const rawKeyId =
    requestedKeyId ??
    getStringRuntimeSetting("ARIA_API_KEYRING_KEY_ID", locals);
  if (!rawKeyId) throw new Error("API_KEYRING_KEY_ID_UNAVAILABLE");
  const keyId = KeyIdSchema.parse(rawKeyId);
  const encoded = getStringRuntimeSetting(
    `ARIA_API_KEYRING_KEY_${keyId.toUpperCase()}`,
    locals,
  );
  if (!encoded) throw new Error("API_KEYRING_KEY_UNAVAILABLE");
  let rootKey: Uint8Array<ArrayBuffer>;
  try {
    rootKey = base64ToBytes(encoded);
  } catch {
    throw new Error("API_KEYRING_KEY_INVALID");
  }
  if (rootKey.byteLength !== 32) throw new Error("API_KEYRING_KEY_INVALID");
  return { keyId, rootKey };
}

/**
 * Returns available numbered keyring IDs with the active ID first.
 * Used when verifying digests that may still reference a prior rotation.
 */
export function listAvailableApiKeyringIds(locals?: RuntimeLocals): string[] {
  const discovered = new Set<string>();
  const consider = (name: string) => {
    const match = NUMBERED_KEYRING_SECRET_PATTERN.exec(name);
    const suffix = match?.[1];
    if (!suffix || suffix.toUpperCase() === "ID") return;
    try {
      discovered.add(KeyIdSchema.parse(suffix.toLowerCase()));
    } catch {
      // Ignore malformed secret names.
    }
  };
  for (const name of Object.keys(getCloudflareEnv(locals))) consider(name);
  if (typeof process !== "undefined") {
    for (const name of Object.keys(process.env)) consider(name);
  }

  const active = getStringRuntimeSetting("ARIA_API_KEYRING_KEY_ID", locals);
  const ordered: string[] = [];
  if (active) {
    try {
      ordered.push(KeyIdSchema.parse(active));
    } catch {
      // Active ID may be unset or invalid in incomplete test fixtures.
    }
  }
  for (const keyId of [...discovered].sort()) {
    if (!ordered.includes(keyId)) ordered.push(keyId);
  }
  return ordered;
}

async function purposeHmacKey(
  keyring: ApiKeyring,
  purpose: ApiHmacPurpose,
): Promise<CryptoKey> {
  const source = await crypto.subtle.importKey(
    "raw",
    ownedBytes(keyring.rootKey),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`aria-site-api:${keyring.keyId}:v1`),
      info: encoder.encode(purpose),
    },
    source,
    256,
  );
  return crypto.subtle.importKey(
    "raw",
    bits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacApiValue(
  keyring: ApiKeyring,
  purpose: ApiHmacPurpose,
  value: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await purposeHmacKey(keyring, purpose),
    encoder.encode(value),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyApiValue(
  keyring: ApiKeyring,
  purpose: ApiHmacPurpose,
  value: string,
  expectedSignature: string,
): Promise<boolean> {
  try {
    const normalized = expectedSignature
      .replace(/-/gu, "+")
      .replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return crypto.subtle.verify(
      "HMAC",
      await purposeHmacKey(keyring, purpose),
      base64ToBytes(padded),
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

export type ApiHmacPurpose =
  | "credential"
  | "cursor"
  | "oauth-device"
  | "oauth-user-code"
  | "oauth-access"
  | "oauth-refresh";

export function createRawApiToken(): { token: string; prefix: string } {
  const prefix = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(9)));
  const secret = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { token: `aria_api_${prefix}.${secret}`, prefix };
}

export function parseRawApiToken(
  raw: string,
): { token: string; prefix: string } | null {
  const match = TOKEN_PATTERN.exec(raw);
  return match ? { token: raw, prefix: match[1]! } : null;
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
