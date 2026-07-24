/**
 * Checksum and signature verification for pack payloads.
 * Verify downloaded pack checksums and signatures.
 */

import type {
  PackPayload,
  PackManifest,
  RegistryResult,
  RegistryError,
} from "./types";
import {
  validatePackManifest as validatePackManifestSchema,
  validatePackPayload as validatePackPayloadSchema,
} from "../schemas/nodes";

export type PackSignatureAlgorithm = "ECDSA_P256_SHA256";

export interface TrustedPackSigner {
  keyId: string;
  algorithm: PackSignatureAlgorithm;
  publicKeySpkiPem: string;
  name?: string;
}

export const OFFICIAL_PACK_SIGNERS: ReadonlyArray<TrustedPackSigner> = [
  {
    keyId: "aria-official-2026-01",
    algorithm: "ECDSA_P256_SHA256",
    publicKeySpkiPem: `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEXqyBKPECFOy8OCMN1O47VlXjZzts
aCsfcYaHyEXSdmbLYFAOrzUxHFZKNgX2+KtV4E3VI2ced0SFnzId05CH2Q==
-----END PUBLIC KEY-----`,
    name: "Aria Official",
  },
];

const DEFAULT_TRUSTED_SIGNERS: ReadonlyArray<TrustedPackSigner> =
  OFFICIAL_PACK_SIGNERS;

export interface VerifyPackSignatureOptions {
  requireSignature?: boolean;
  trustedSigners?: ReadonlyArray<TrustedPackSigner>;
}

/**
 * Compute SHA-256 checksum of a string or buffer
 */
export async function computeChecksum(
  data: string | ArrayBuffer,
): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === "string" ? encoder.encode(data) : data;

  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPayloadChecksum(
  payload: PackPayload,
  expectedChecksum?: string,
): Promise<RegistryResult<void>> {
  const checksumToVerify = expectedChecksum ?? payload.manifest.checksum;

  if (!checksumToVerify) {
    // No checksum to verify - this is acceptable for development
    return { success: true, data: undefined };
  }

  try {
    // Compute checksum of canonicalized components content (stable across key order)
    const componentsJson = toCanonicalJson(payload.components);
    const computedChecksum = await computeChecksum(componentsJson);

    if (computedChecksum !== checksumToVerify) {
      return {
        success: false,
        error: {
          code: "CHECKSUM_MISMATCH",
          message: `Payload checksum mismatch. Expected: ${checksumToVerify.slice(0, 8)}..., Got: ${computedChecksum.slice(0, 8)}...`,
          details: {
            expected: checksumToVerify,
            computed: computedChecksum,
          },
        },
      };
    }

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: `Failed to compute checksum: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
    };
  }
}

export async function generatePayloadChecksum(
  payload: PackPayload,
): Promise<string> {
  const componentsJson = toCanonicalJson(payload.components);
  return computeChecksum(componentsJson);
}

export interface SignatureVerificationResult {
  valid: boolean;
  signer?: string;
  signedAt?: string;
}

interface PackSignaturePayload {
  packId: string;
  version: string;
  checksum: string | null;
  tier: PackManifest["tier"];
  minAppVersion: string | null;
  componentIds: string[];
  publishedAt: string;
}

function createError(
  code: RegistryError["code"],
  message: string,
  details?: Record<string, unknown>,
): RegistryError {
  return { code, message, details };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }

  return value;
}

function toCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  return base64ToBytes(padded);
}

function pemToSpkiBytes(pem: string): Uint8Array {
  const withoutHeaders = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");

  return base64ToBytes(withoutHeaders);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function importEcdsaPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  const keyBytes = pemToSpkiBytes(pem);
  return crypto.subtle.importKey(
    "spki",
    toArrayBuffer(keyBytes),
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"],
  );
}

export function buildPackSignaturePayload(
  manifest: PackManifest,
): PackSignaturePayload {
  return {
    packId: manifest.id,
    version: manifest.version,
    checksum: manifest.checksum ?? null,
    tier: manifest.tier,
    minAppVersion: manifest.minAppVersion ?? null,
    componentIds: manifest.componentIds,
    publishedAt: manifest.publishedAt,
  };
}

export function getPackSignatureMessage(manifest: PackManifest): string {
  return toCanonicalJson(buildPackSignaturePayload(manifest));
}

/**
 * Verify pack signature (if present)
 *
 * Note: Full signature verification requires a public key infrastructure.
 * This is a placeholder for future implementation.
 */
export async function verifyPackSignature(
  payload: PackPayload,
  signature?: string,
  options?: VerifyPackSignatureOptions,
): Promise<RegistryResult<SignatureVerificationResult>> {
  const manifestSignature = signature ?? payload.manifest.signature;
  const signerKeyId = payload.manifest.signerKeyId;
  const algorithm = payload.manifest.signatureAlgorithm;
  const requireSignature = options?.requireSignature ?? false;

  if (!manifestSignature) {
    if (requireSignature) {
      return {
        success: false,
        error: createError(
          "SIGNATURE_MISSING",
          "Pack signature is required but missing",
        ),
      };
    }

    return {
      success: true,
      data: { valid: true },
    };
  }

  if (!signerKeyId) {
    return {
      success: false,
      error: createError(
        "INVALID_MANIFEST",
        "Pack signature is present but signerKeyId is missing",
      ),
    };
  }

  if (!algorithm) {
    return {
      success: false,
      error: createError(
        "INVALID_MANIFEST",
        "Pack signature is present but signatureAlgorithm is missing",
      ),
    };
  }

  if (algorithm !== "ECDSA_P256_SHA256") {
    return {
      success: false,
      error: createError(
        "UNSUPPORTED_SIGNATURE_ALGORITHM",
        `Unsupported signature algorithm: ${algorithm}`,
        { algorithm },
      ),
    };
  }

  const signer = (options?.trustedSigners ?? DEFAULT_TRUSTED_SIGNERS).find(
    (candidate) => candidate.keyId === signerKeyId,
  );

  if (!signer) {
    return {
      success: false,
      error: createError(
        "UNTRUSTED_SIGNER",
        `Untrusted signer: ${signerKeyId}`,
        {
          signerKeyId,
        },
      ),
    };
  }

  if (signer.algorithm !== algorithm) {
    return {
      success: false,
      error: createError(
        "UNSUPPORTED_SIGNATURE_ALGORITHM",
        `Signer ${signerKeyId} is not configured for algorithm ${algorithm}`,
        { signerKeyId, signerAlgorithm: signer.algorithm, algorithm },
      ),
    };
  }

  try {
    const cryptoKey = await importEcdsaPublicKeyFromPem(
      signer.publicKeySpkiPem,
    );
    const signatureBytes = base64UrlToBytes(manifestSignature);
    const signedMessage = new TextEncoder().encode(
      getPackSignatureMessage(payload.manifest),
    );

    const verified = await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      cryptoKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(signedMessage),
    );

    if (!verified) {
      return {
        success: false,
        error: createError(
          "SIGNATURE_INVALID",
          `Invalid signature for pack ${payload.manifest.id}`,
          {
            signerKeyId,
          },
        ),
      };
    }

    return {
      success: true,
      data: {
        valid: true,
        signer: signer.name ?? signer.keyId,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: createError(
        "SIGNATURE_INVALID",
        `Failed to verify pack signature: ${error instanceof Error ? error.message : "Unknown error"}`,
        { signerKeyId },
      ),
    };
  }
}

export function validateManifestStructure(
  manifest: unknown,
): RegistryResult<PackManifest> {
  const parsed = validatePackManifestSchema(manifest);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "INVALID_MANIFEST",
        message: "Pack manifest failed schema validation",
        details: parsed.error.issues,
      },
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export async function validatePackPayload(
  payload: unknown,
  options?: {
    skipChecksum?: boolean;
    skipSignature?: boolean;
    requireSignature?: boolean;
    trustedSigners?: ReadonlyArray<TrustedPackSigner>;
  },
): Promise<RegistryResult<PackPayload>> {
  const parsedPayload = validatePackPayloadSchema(payload);
  if (!parsedPayload.success) {
    return {
      success: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "Pack payload failed schema validation",
        details: parsedPayload.error.issues,
      },
    };
  }

  const validPayload = parsedPayload.data;

  // Verify all declared components are present
  const declaredIds = new Set(validPayload.manifest.componentIds);
  const presentIds = new Set(
    validPayload.components.map((component) => component.id),
  );

  const missingComponents = [...declaredIds].filter(
    (id) => !presentIds.has(id),
  );
  if (missingComponents.length > 0) {
    return {
      success: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: `Missing declared components: ${missingComponents.join(", ")}`,
        details: { missingComponents },
      },
    };
  }

  // Verify checksum if not skipped
  if (!options?.skipChecksum) {
    const checksumResult = await verifyPayloadChecksum(validPayload);
    if (!checksumResult.success) {
      return checksumResult as RegistryResult<PackPayload>;
    }
  }

  if (!options?.skipSignature) {
    const signatureResult = await verifyPackSignature(validPayload, undefined, {
      requireSignature: options?.requireSignature,
      trustedSigners: options?.trustedSigners,
    });
    if (!signatureResult.success) {
      return signatureResult as RegistryResult<PackPayload>;
    }
  }

  return {
    success: true,
    data: validPayload,
  };
}
