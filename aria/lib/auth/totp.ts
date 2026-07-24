/**
 * Uses the `otpauth` library for TOTP generation and
 * verification. Implements RFC 6238 with 30-second time steps.
 */

import { TOTP, Secret } from "otpauth";
import { hashPassword, verifyPassword } from "./password";

const TOTP_CONFIG = {
  ISSUER: "Aria",
  ALGORITHM: "SHA1" as const,
  DIGITS: 6,
  PERIOD: 30, // seconds
};

const BACKUP_CODES = {
  COUNT: 10,
  LENGTH: 8, // characters per code
};

/**
 * Generate a new TOTP secret for a user
 *
 * @param username - User's username (shown in authenticator app)
 * @returns Object with secret (base32), QR code URL, and backup codes
 */
export async function generateTotpSecret(username: string): Promise<{
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  backupCodesHashed: string[];
}> {
  const secret = new Secret({ size: 20 }); // 160 bits

  const totp = new TOTP({
    issuer: TOTP_CONFIG.ISSUER,
    label: username,
    algorithm: TOTP_CONFIG.ALGORITHM,
    digits: TOTP_CONFIG.DIGITS,
    period: TOTP_CONFIG.PERIOD,
    secret: secret,
  });

  // Generate QR code URL (otpauth:// format)
  const qrCodeUrl = totp.toString();

  const backupCodes = await generateBackupCodes();

  return {
    secret: secret.base32,
    qrCodeUrl,
    backupCodes: backupCodes.plaintext,
    backupCodesHashed: backupCodes.hashed,
  };
}

/**
 * Verify a TOTP code
 *
 * @param secret - Base32 encoded TOTP secret
 * @param code - 6-digit code from authenticator app
 * @param window - Number of periods to check before/after current (default 1)
 * @returns True if code is valid
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  window: number = 1,
): boolean {
  try {
    const totp = new TOTP({
      issuer: TOTP_CONFIG.ISSUER,
      algorithm: TOTP_CONFIG.ALGORITHM,
      digits: TOTP_CONFIG.DIGITS,
      period: TOTP_CONFIG.PERIOD,
      secret: Secret.fromBase32(secret),
    });

    // validate() returns the delta (time step difference) or null if invalid
    const delta = totp.validate({ token: code, window });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Generate current TOTP code (for testing)
 *
 * @param secret - Base32 encoded TOTP secret
 * @returns Current 6-digit code
 */
export function generateTotpCode(secret: string): string {
  const totp = new TOTP({
    issuer: TOTP_CONFIG.ISSUER,
    algorithm: TOTP_CONFIG.ALGORITHM,
    digits: TOTP_CONFIG.DIGITS,
    period: TOTP_CONFIG.PERIOD,
    secret: Secret.fromBase32(secret),
  });

  return totp.generate();
}

/**
 * Generate backup codes for account recovery
 *
 * @returns Object with plaintext codes (shown to user once) and hashed codes (stored)
 */
export async function generateBackupCodes(): Promise<{
  plaintext: string[];
  hashed: string[];
}> {
  const plaintext: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < BACKUP_CODES.COUNT; i++) {
    const code = generateRandomCode(BACKUP_CODES.LENGTH);
    plaintext.push(code);

    // Hash for storage
    const hash = await hashPassword(code);
    hashed.push(hash);
  }

  return { plaintext, hashed };
}

/**
 * Verify a backup code
 *
 * @param code - Backup code entered by user
 * @param hashedCodes - Array of hashed backup codes
 * @param usedIndices - Array of already-used code indices
 * @returns Index of matching code, or -1 if invalid
 */
export async function verifyBackupCode(
  code: string,
  hashedCodes: string[],
  usedIndices: number[],
): Promise<number> {
  // Normalize code (remove spaces, dashes, make uppercase)
  const normalizedCode = code.replace(/[\s-]/g, "").toUpperCase();

  for (let i = 0; i < hashedCodes.length; i++) {
    if (usedIndices.includes(i)) {
      continue;
    }

    // Check if code matches
    const isValid = await verifyPassword(normalizedCode, hashedCodes[i]);
    if (isValid) {
      return i;
    }
  }

  return -1;
}

function generateRandomCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluded: I, O, 0, 1 (confusing)
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }

  return code;
}

/**
 * Format backup code for display (add dashes for readability)
 * Example: "ABCD1234" -> "ABCD-1234"
 */
export function formatBackupCode(code: string): string {
  if (code.length !== 8) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function parseBackupCodes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Parse used backup code indices from JSON string
 */
export function parseUsedIndices(json: string | null): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stringifyBackupCodes(codes: string[]): string {
  return JSON.stringify(codes);
}

export function stringifyUsedIndices(indices: number[]): string {
  return JSON.stringify(indices);
}
