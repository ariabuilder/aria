const ALGORITHM = "AES-GCM";
const KEY_LENGTH_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importMasterKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const keyData = rawKey.buffer.slice(
    rawKey.byteOffset,
    rawKey.byteOffset + rawKey.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function generateMasterKeyMaterial(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

export async function encryptSecret(
  masterKeyMaterial: string,
  plaintext: string,
): Promise<{ iv: string; ciphertext: string }> {
  const key = await importMasterKey(base64ToBytes(masterKeyMaterial));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv.buffer.slice(0) as ArrayBuffer },
    key,
    encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer,
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptSecret(
  masterKeyMaterial: string,
  payload: { iv: string; ciphertext: string },
): Promise<string> {
  const key = await importMasterKey(base64ToBytes(masterKeyMaterial));
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: base64ToBytes(payload.iv).buffer.slice(0) as ArrayBuffer,
    },
    key,
    base64ToBytes(payload.ciphertext).buffer.slice(0) as ArrayBuffer,
  );
  return new TextDecoder().decode(decrypted);
}
