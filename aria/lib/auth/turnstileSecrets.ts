import { z } from "zod";
import { getStringRuntimeSetting, type RuntimeLocals } from "../cloudflare/env";

const KeyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
export const TurnstileSecretEnvelopeSchema = z.object({
  ciphertextBase64: z.string().min(1),
  ivBase64: z.string().min(1),
  keyId: KeyIdSchema,
  algorithm: z.literal("AES-256-GCM"),
});
export type TurnstileSecretEnvelope = z.infer<typeof TurnstileSecretEnvelopeSchema>;

export const TurnstileStoredSecretSchema = z.object({
  siteKey: z.string().trim().min(1).max(32),
  secretKey: z.string().trim().min(1).max(4096),
});
export type TurnstileStoredSecret = z.infer<typeof TurnstileStoredSecretSchema>;

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

/**
 * Encrypts the provider secret returned when Aria provisions a Turnstile
 * widget. This is intentionally separate from the public CAPTCHA config.
 */
export class TurnstileSecretCipher {
  constructor(private readonly locals?: RuntimeLocals) {}

  private keyId(): string {
    const candidate =
      getStringRuntimeSetting("ARIA_TURNSTILE_ENCRYPTION_KEY_ID", this.locals) ?? "v1";
    const parsed = KeyIdSchema.safeParse(candidate);
    if (!parsed.success) throw new Error("TURNSTILE_ENCRYPTION_KEY_ID_INVALID");
    return parsed.data;
  }

  private async key(keyId: string): Promise<CryptoKey> {
    const encoded = getStringRuntimeSetting(
      `ARIA_TURNSTILE_ENCRYPTION_KEY_${keyId.toUpperCase()}`,
      this.locals,
    );
    if (!encoded) throw new Error("TURNSTILE_ENCRYPTION_KEY_UNAVAILABLE");
    let raw: Uint8Array<ArrayBuffer>;
    try {
      raw = ownedBytes(base64ToBytes(encoded));
    } catch {
      throw new Error("TURNSTILE_ENCRYPTION_KEY_INVALID");
    }
    if (raw.byteLength !== 32) throw new Error("TURNSTILE_ENCRYPTION_KEY_INVALID");
    return crypto.subtle.importKey("raw", raw.buffer, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  async encrypt(value: TurnstileStoredSecret): Promise<TurnstileSecretEnvelope> {
    const secret = TurnstileStoredSecretSchema.parse(value);
    const keyId = this.keyId();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(turnstileSecretAad(secret.siteKey)) },
      await this.key(keyId),
      new TextEncoder().encode(JSON.stringify(secret)),
    );
    return TurnstileSecretEnvelopeSchema.parse({
      ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
      ivBase64: bytesToBase64(iv),
      keyId,
      algorithm: "AES-256-GCM",
    });
  }

  async decrypt(envelope: unknown, siteKey: string): Promise<TurnstileStoredSecret> {
    const parsed = TurnstileSecretEnvelopeSchema.parse(envelope);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ownedBytes(base64ToBytes(parsed.ivBase64)),
        additionalData: new TextEncoder().encode(turnstileSecretAad(siteKey)),
      },
      await this.key(parsed.keyId),
      ownedBytes(base64ToBytes(parsed.ciphertextBase64)),
    );
    const secret = TurnstileStoredSecretSchema.parse(
      JSON.parse(new TextDecoder().decode(plaintext)),
    );
    if (secret.siteKey !== siteKey) throw new Error("TURNSTILE_SECRET_SITEKEY_MISMATCH");
    return secret;
  }
}

export function turnstileSecretAad(siteKey: string): string {
  return `aria-turnstile-secret:v1:${siteKey}`;
}
