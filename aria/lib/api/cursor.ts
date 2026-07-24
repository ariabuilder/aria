import { z } from "zod";
import {
  bytesToBase64Url,
  hmacApiValue,
  readApiKeyring,
  stableJson,
  verifyApiValue,
} from "./crypto";
import { ApiHttpError } from "./http";
import type { RuntimeLocals } from "../cloudflare/env";

const CursorPayloadSchema = z.object({
  v: z.literal(1),
  kid: z.string().min(1),
  site: z.uuid(),
  resource: z.literal("entries"),
  collectionId: z.string().min(1),
  binding: z.string().min(1),
  page: z.int().positive(),
  index: z.int().nonnegative(),
  pageSize: z.int().positive().max(100),
  exp: z.int().positive(),
});
export type EntryCursorPayload = z.infer<typeof CursorPayloadSchema>;

function encodeText(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeText(value: string): string {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const bytes = Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}

export async function createEntryCursor(
  locals: RuntimeLocals,
  input: Omit<EntryCursorPayload, "v" | "kid" | "exp"> & { expiresInMs?: number },
): Promise<string> {
  const keyring = readApiKeyring(locals);
  const { expiresInMs, ...cursor } = input;
  const payload = CursorPayloadSchema.parse({
    ...cursor,
    v: 1,
    kid: keyring.keyId,
    exp: Date.now() + (expiresInMs ?? 15 * 60_000),
  });
  const encoded = encodeText(stableJson(payload));
  return `${encoded}.${await hmacApiValue(keyring, "cursor", encoded)}`;
}

export async function parseEntryCursor(
  locals: RuntimeLocals,
  raw: string,
  expected: Pick<EntryCursorPayload, "site" | "collectionId" | "binding">,
): Promise<EntryCursorPayload> {
  const [encoded, signature, ...extra] = raw.split(".");
  if (!encoded || !signature || extra.length) return invalidCursor();
  let payload: EntryCursorPayload;
  try {
    payload = CursorPayloadSchema.parse(JSON.parse(decodeText(encoded)));
  } catch {
    return invalidCursor();
  }
  const valid = await verifyApiValue(
    readApiKeyring(locals, payload.kid),
    "cursor",
    encoded,
    signature,
  );
  if (
    !valid ||
    payload.exp <= Date.now() ||
    payload.site !== expected.site ||
    payload.collectionId !== expected.collectionId ||
    payload.binding !== expected.binding
  ) {
    return invalidCursor();
  }
  return payload;
}

function invalidCursor(): never {
  throw new ApiHttpError({
    status: 400,
    code: "bad_request",
    message: "Cursor is invalid, expired, or does not match this request",
  });
}
