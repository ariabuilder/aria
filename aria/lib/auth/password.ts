/**
 * Uses PBKDF2 with SHA-256 for password hashing. Works identically in Node.
 */

/**
 * PBKDF2 configuration
 * - 100,000 iterations (Cloudflare Workers max limit)
 * - 16 bytes salt (128 bits)
 * - 32 bytes hash (256 bits)
 */
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;
const ALGORITHM = "PBKDF2";
const HASH_ALGORITHM = "SHA-256";

/**
 * Convert ArrayBuffer or Uint8Array to hex string
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generate cryptographically secure random bytes
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Derive key from password using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    HASH_LENGTH * 8, // bits
  );
}

/**
 * Hash a password using PBKDF2
 *
 * @param password - Plain text password
 * @returns Hash in format "salt.hash" (both hex-encoded)
 *
 * @example
 * const hash = await hashPassword("mySecurePassword");
 * // Returns: "a1b2c3d4e5f6...salt.a1b2c3d4e5f6...hash"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await deriveKey(password, salt);

  const saltHex = bufferToHex(salt);
  const hashHex = bufferToHex(hash);

  return `${saltHex}.${hashHex}`;
}

/**
 * Verify a password against a stored hash
 *
 * @param password - Plain text password to verify
 * @param storedHash - Hash in format "salt.hash" (from database)
 * @returns True if password matches, false otherwise
 *
 * @example
 * const isValid = await verifyPassword("mySecurePassword", storedHash);
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(".");
    if (!saltHex || !hashHex) {
      return false;
    }

    const salt = hexToBuffer(saltHex);

    // Derive hash from provided password
    const derivedHash = await deriveKey(password, salt);
    const derivedHashHex = bufferToHex(derivedHash);

    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(hashHex, derivedHashHex);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Always iterates over the maximum length to avoid leaking length information
 */
function timingSafeEqual(a: string, b: string): boolean {
  // Start with length comparison result to avoid early return
  let result = a.length === b.length ? 0 : 1;
  const maxLen = Math.max(a.length, b.length);

  // Always iterate over max length to prevent timing leaks
  for (let i = 0; i < maxLen; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return result === 0;
}

/**
 * Generate a secure random token (for password reset, etc.)
 *
 * @param length - Length in bytes (default 32 = 256 bits)
 * @returns Hex-encoded token
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return bufferToHex(bytes);
}

/**
 * Hash a token using SHA-256 (for storing reset tokens)
 *
 * @param token - Plain text token
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hash);
}
