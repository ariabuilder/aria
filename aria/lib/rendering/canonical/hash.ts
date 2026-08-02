import { z } from "zod";

import { stableSerializeJson } from "./stableJson";

export const CanonicalSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .brand<"CanonicalSha256">();
export type CanonicalSha256 = z.infer<typeof CanonicalSha256Schema>;

const encoder = new TextEncoder();

/** Produces a full SHA-256 hex digest using the Web Crypto API only. */
export async function sha256Text(input: string): Promise<CanonicalSha256> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(input),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return CanonicalSha256Schema.parse(hex);
}

/** Hashes validated, stable JSON without runtime or timestamp metadata. */
export function hashCanonicalJson(
  input: unknown,
): Promise<CanonicalSha256> {
  return sha256Text(stableSerializeJson(input));
}
