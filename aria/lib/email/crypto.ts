import { z } from "zod";
import { getStringRuntimeSetting, type RuntimeLocals } from "../cloudflare/env";
import { EncryptedEnvelopeSchema, type EncryptedEnvelope } from "./types";

const KeyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
export type EmailManagedKeyring = {
  getDefaultKey(): Promise<Readonly<{ keyId: string; keyBase64: string }> | null>;
  getKey(keyId: string): Promise<Readonly<{ keyId: string; keyBase64: string }> | null>;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

export class EmailSecretCipher {
  constructor(
    private readonly locals?: RuntimeLocals,
    private readonly managedKeyring?: EmailManagedKeyring,
  ) {}

  private async key(keyId: string): Promise<CryptoKey> {
    const parsedKeyId = KeyIdSchema.parse(keyId);
    const encoded =
      getStringRuntimeSetting(`ARIA_EMAIL_SECRET_KEY_${parsedKeyId.toUpperCase()}`, this.locals) ??
      (await this.managedKeyring?.getKey(parsedKeyId))?.keyBase64;
    if (!encoded) throw new Error("EMAIL_KEY_UNAVAILABLE");
    const raw = ownedBytes(base64ToBytes(encoded));
    if (raw.byteLength !== 32) throw new Error("EMAIL_KEY_INVALID");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  async encryptJson(value: unknown, additionalData: string): Promise<EncryptedEnvelope> {
    const rawKeyId = getStringRuntimeSetting("ARIA_EMAIL_SECRET_KEY_ID", this.locals);
    const managedKey = rawKeyId ? null : await this.managedKeyring?.getDefaultKey();
    const keyIdCandidate = rawKeyId ?? managedKey?.keyId;
    if (!keyIdCandidate) throw new Error("EMAIL_KEY_ID_UNAVAILABLE");
    const parsedKeyId = KeyIdSchema.safeParse(keyIdCandidate);
    if (!parsedKeyId.success) throw new Error("EMAIL_KEY_ID_INVALID");
    const keyId = parsedKeyId.data;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(additionalData) }, await this.key(keyId), plaintext);
    return EncryptedEnvelopeSchema.parse({ ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)), ivBase64: bytesToBase64(iv), keyId, algorithm: "AES-256-GCM" });
  }

  async decryptJson<T>(envelope: EncryptedEnvelope, additionalData: string, schema: z.ZodType<T>): Promise<T> {
    const parsed = EncryptedEnvelopeSchema.parse(envelope);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ownedBytes(base64ToBytes(parsed.ivBase64)), additionalData: new TextEncoder().encode(additionalData) }, await this.key(parsed.keyId), ownedBytes(base64ToBytes(parsed.ciphertextBase64)));
    return schema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  }
}

export function connectionSecretAad(siteId: string, connectionId: string, provider: string): string {
  return `aria-email-secret:v1:${siteId}:${connectionId}:${provider}`;
}
export function deliveryPayloadAad(siteId: string, deliveryId: string, templateKey: string, version: number): string {
  return `aria-email-payload:v1:${siteId}:${deliveryId}:${templateKey}:${version}`;
}
