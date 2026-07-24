import crypto from "node:crypto";

export function computeSHA256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex").toLowerCase();
}

export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
