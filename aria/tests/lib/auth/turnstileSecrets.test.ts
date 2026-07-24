import { describe, expect, it } from "vitest";
import { TurnstileSecretCipher } from "../../../lib/auth/turnstileSecrets";

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const locals = {
  cfBindings: { ARIA_TURNSTILE_ENCRYPTION_KEY_V1: key },
};

describe("TurnstileSecretCipher", () => {
  it("encrypts the provider secret and binds it to the public site key", async () => {
    const cipher = new TurnstileSecretCipher(locals);
    const envelope = await cipher.encrypt({
      siteKey: "0x4AAAAAAA",
      secretKey: "provider-verification-secret",
    });

    expect(JSON.stringify(envelope)).not.toContain("provider-verification-secret");
    await expect(cipher.decrypt(envelope, "0x4AAAAAAA")).resolves.toEqual({
      siteKey: "0x4AAAAAAA",
      secretKey: "provider-verification-secret",
    });
    await expect(cipher.decrypt(envelope, "0x4BBBBBBB")).rejects.toBeDefined();
  });
});
