import { bytesToBase64Url, type ApiKeyring } from "../../api/crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(
  keyring: ApiKeyring,
  usage: "encrypt" | "sign",
): Promise<CryptoKey> {
  const source = await crypto.subtle.importKey(
    "raw",
    keyring.rootKey,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`aria:webhook:${keyring.keyId}:v1`),
      info: encoder.encode(
        usage === "encrypt"
          ? "aria/integration/encryption/v1"
          : "aria/webhook/signing-secret/v1",
      ),
    },
    source,
    usage === "encrypt"
      ? { name: "AES-GCM", length: 256 }
      : { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign"],
  );
}

export function createWebhookSigningSecret(): {
  secret: string;
  prefix: string;
} {
  const prefix = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(6)));
  const value = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { secret: `aria_whsec_${prefix}.${value}`, prefix };
}

export async function encryptWebhookSecret(
  keyring: ApiKeyring,
  secret: string,
  endpointId: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(`aria-webhook:${endpointId}:v1`),
    },
    await deriveKey(keyring, "encrypt"),
    encoder.encode(secret),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptWebhookSecret(
  keyring: ApiKeyring,
  ciphertext: string,
  endpointId: string,
): Promise<string> {
  const [iv, value] = ciphertext.split(".");
  if (!iv || !value) throw new Error("WEBHOOK_SECRET_CIPHERTEXT_INVALID");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64Url(iv),
      additionalData: encoder.encode(`aria-webhook:${endpointId}:v1`),
    },
    await deriveKey(keyring, "encrypt"),
    decodeBase64Url(value),
  );
  return decoder.decode(plaintext);
}

export async function signWebhookRequest(
  secret: string,
  timestamp: number,
  eventId: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`v1:${timestamp}:${eventId}:${rawBody}`),
  );
  return `v1=${[...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
