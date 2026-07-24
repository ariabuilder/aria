import { createHash, randomBytes } from "node:crypto";
import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";
import {
  McpTokenListItemSchema,
  McpTokenRecordSchema,
  type CreateMcpTokenInput,
  type McpScope,
  type McpTokenListItem,
  type McpTokenRecord,
} from "../schemas";
import type { SessionUser } from "../../../../../lib/auth/types";
import { getTokenDb } from "./tokenDb";

type SqlRow = Record<string, unknown>;
type McpTokenAccessMode = "global" | "personal";

const TOKEN_PREFIX = "aria_mcp_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rowToRecord(row: Record<string, unknown>): McpTokenRecord {
  return McpTokenRecordSchema.parse({
    id: row.id,
    type: row.type,
    name: row.name,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    userId: row.user_id ?? null,
    createdByUserId: row.created_by_user_id,
    createdByUsername: String(row.created_by_username ?? ""),
    scopes: JSON.parse(String(row.scopes ?? "[]")) as McpScope[],
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
  });
}

export function toMcpListItem(record: McpTokenRecord): McpTokenListItem {
  return McpTokenListItemSchema.parse({
    id: record.id,
    type: record.type,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    userId: record.userId,
    createdByUserId: record.createdByUserId,
    createdByUsername: record.createdByUsername,
    scopes: record.scopes,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  });
}

export async function createMcpTokenRecord(input: {
  locals: RuntimeLocals | App.Locals;
  createdByUserId: string;
  createdByUsername: string;
  userId: string | null;
  fields: CreateMcpTokenInput;
}): Promise<{ token: string; record: McpTokenListItem }> {
  const tokenDb = await getTokenDb(input.locals);

  const rawSecret = randomBytes(24).toString("base64url");
  const token = `${TOKEN_PREFIX}${rawSecret}`;
  const tokenHash = hashToken(token);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const tokenPrefix = token.slice(0, 16);

  const scopesJson = JSON.stringify(input.fields.scopes);

  await tokenDb.execute(
    `INSERT INTO aria_mcp_tokens
     (id, type, name, token_hash, token_prefix, user_id, created_by_user_id, created_by_username, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.fields.type,
      input.fields.name,
      tokenHash,
      tokenPrefix,
      input.userId,
      input.createdByUserId,
      input.createdByUsername,
      scopesJson,
      input.fields.expiresAt ?? null,
      createdAt,
    ],
  );

  const row: SqlRow = {
    id,
    type: input.fields.type,
    name: input.fields.name,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    user_id: input.userId,
    created_by_user_id: input.createdByUserId,
    created_by_username: input.createdByUsername,
    scopes: scopesJson,
    expires_at: input.fields.expiresAt ?? null,
    created_at: createdAt,
    last_used_at: null,
    revoked_at: null,
  };

  const record = rowToRecord(row);
  return { token, record: toMcpListItem(record) };
}

function tokenAccessWhereClause(input: {
  actorUser: SessionUser;
  mode: McpTokenAccessMode;
}): { sql: string; params: unknown[] } {
  if (input.mode === "personal") {
    return {
      sql: "revoked_at IS NULL AND type = ? AND user_id = ?",
      params: ["personal", input.actorUser.id],
    };
  }

  return {
    sql: "revoked_at IS NULL",
    params: [],
  };
}

export async function listMcpTokenRecords(input: {
  locals: RuntimeLocals | App.Locals;
  actorUser: SessionUser;
  mode: McpTokenAccessMode;
}): Promise<McpTokenListItem[]> {
  const tokenDb = await getTokenDb(input.locals);
  const where = tokenAccessWhereClause(input);

  const rows = await tokenDb.queryAll(
    `SELECT * FROM aria_mcp_tokens WHERE ${where.sql} ORDER BY created_at DESC`,
    where.params,
  );

  return rows.map((row) => toMcpListItem(rowToRecord(row)));
}

export async function revokeMcpTokenRecord(input: {
  locals: RuntimeLocals | App.Locals;
  actorUser: SessionUser;
  mode: McpTokenAccessMode;
  tokenId: string;
}): Promise<boolean> {
  const tokenDb = await getTokenDb(input.locals);
  const where = tokenAccessWhereClause(input);
  const row = await tokenDb.queryFirst(
    `SELECT id FROM aria_mcp_tokens WHERE id = ? AND ${where.sql} LIMIT 1`,
    [input.tokenId, ...where.params],
  );

  if (!row) {
    return false;
  }

  await tokenDb.execute(
    `UPDATE aria_mcp_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
    [new Date().toISOString(), input.tokenId],
  );

  return true;
}

export async function updateMcpTokenScopes(input: {
  locals: RuntimeLocals | App.Locals;
  actorUser: SessionUser;
  mode: McpTokenAccessMode;
  tokenId: string;
  scopes: McpScope[];
}): Promise<McpTokenListItem> {
  const tokenDb = await getTokenDb(input.locals);
  const where = tokenAccessWhereClause(input);
  const existing = await tokenDb.queryFirst(
    `SELECT id FROM aria_mcp_tokens WHERE id = ? AND ${where.sql} LIMIT 1`,
    [input.tokenId, ...where.params],
  );

  if (!existing) {
    throw new Error("Token not found");
  }

  await tokenDb.execute(
    `UPDATE aria_mcp_tokens SET scopes = ? WHERE id = ? AND revoked_at IS NULL`,
    [JSON.stringify(input.scopes), input.tokenId],
  );

  const row = await tokenDb.queryFirst(
    `SELECT * FROM aria_mcp_tokens WHERE id = ? LIMIT 1`,
    [input.tokenId],
  );

  if (!row) {
    throw new Error("Token not found");
  }

  return toMcpListItem(rowToRecord(row));
}

export async function resolveMcpTokenAuth(input: {
  locals: RuntimeLocals | App.Locals;
  bearerToken: string;
}): Promise<McpTokenRecord | null> {
  if (!input.bearerToken.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const tokenDb = await getTokenDb(input.locals);
  const tokenHash = hashToken(input.bearerToken);

  const row = await tokenDb.queryFirst(
    `SELECT * FROM aria_mcp_tokens WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  );

  if (!row) {
    return null;
  }

  const record = rowToRecord(row);
  if (record.revokedAt) {
    return null;
  }

  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return null;
  }

  await tokenDb.execute(
    `UPDATE aria_mcp_tokens SET last_used_at = ? WHERE id = ?`,
    [new Date().toISOString(), record.id],
  );

  return record;
}

export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}
