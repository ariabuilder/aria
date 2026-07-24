import { describe, expect, it } from "vitest";
import type { PackPayload } from "../../lib/types/nodes";
import {
  generatePayloadChecksum,
  getPackSignatureMessage,
  verifyPackSignature,
} from "../../lib/registry/verification";

function toBase64Url(buffer: Uint8Array | Buffer): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toPemFromSpki(spki: ArrayBuffer): string {
  const base64 = Buffer.from(spki).toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

async function createSignedPayload(): Promise<{
  payload: PackPayload;
  trustedSigner: {
    keyId: string;
    algorithm: "ECDSA_P256_SHA256";
    publicKeySpkiPem: string;
    name: string;
  };
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );

  const signingKey = keyPair.privateKey;
  const verifyKey = keyPair.publicKey;

  const publicSpki = await crypto.subtle.exportKey("spki", verifyKey);

  const payload: PackPayload = {
    manifest: {
      id: "aria-test-pack",
      name: "Aria Test Pack",
      version: "1.0.0",
      tier: "free",
      componentIds: ["aria.test.component.v1"],
      publishedAt: "2026-02-20T00:00:00.000Z",
      signerKeyId: "test-key-1",
      signatureAlgorithm: "ECDSA_P256_SHA256",
      checksum: undefined,
      signature: undefined,
    },
    components: [
      {
        id: "aria.test.component.v1",
        name: "Test Component",
        source: "aria",
        packId: "aria-test-pack",
        tier: "free",
        isLocked: true,
        nodes: [],
        propSchema: [],
        slots: [],
      },
    ],
  };

  payload.manifest.checksum = await generatePayloadChecksum(payload);

  const message = getPackSignatureMessage(payload.manifest);
  const signatureDer = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    signingKey,
    new TextEncoder().encode(message),
  );

  payload.manifest.signature = toBase64Url(Buffer.from(signatureDer));

  return {
    payload,
    trustedSigner: {
      keyId: "test-key-1",
      algorithm: "ECDSA_P256_SHA256",
      publicKeySpkiPem: toPemFromSpki(publicSpki),
      name: "Test signer",
    },
  };
}

describe("registry signature verification", () => {
  it("verifies a valid signed pack", async () => {
    const { payload, trustedSigner } = await createSignedPayload();

    const result = await verifyPackSignature(payload, undefined, {
      requireSignature: true,
      trustedSigners: [trustedSigner],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
    }
  });

  it("fails when signature is required but missing", async () => {
    const { payload, trustedSigner } = await createSignedPayload();
    payload.manifest.signature = undefined;

    const result = await verifyPackSignature(payload, undefined, {
      requireSignature: true,
      trustedSigners: [trustedSigner],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("SIGNATURE_MISSING");
    }
  });

  it("fails for untrusted signer key", async () => {
    const { payload } = await createSignedPayload();

    const result = await verifyPackSignature(payload, undefined, {
      requireSignature: true,
      trustedSigners: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNTRUSTED_SIGNER");
    }
  });
});
