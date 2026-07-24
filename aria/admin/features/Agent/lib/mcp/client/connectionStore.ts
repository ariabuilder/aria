import { z } from "zod";
import type { RuntimeLocals } from "../../../../../../lib/cloudflare/env";
import { getTokenDb } from "../tokenDb";
import {
  CreateExternalMcpConnectionInputSchema,
  DeleteExternalMcpConnectionInputSchema,
  ExternalMcpConnectionSchema,
  UpdateExternalMcpConnectionInputSchema,
  type ExternalMcpConnection,
} from "./schemas";

const RowSchema = z
  .object({
    id: z.string(),
    site_id: z.string(),
    name: z.string(),
    server_url: z.string(),
    trust_tier: z.string(),
    enabled: z.union([z.boolean(), z.int()]),
    server_identity: z.string().nullable(),
    manifest_fingerprint: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose();

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS aria_mcp_connections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  trust_tier TEXT NOT NULL DEFAULT 'read_only',
  enabled INTEGER NOT NULL DEFAULT 0,
  server_identity TEXT,
  manifest_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(site_id, name)
)`;

function rowToConnection(input: unknown): ExternalMcpConnection {
  const row = RowSchema.parse(input);
  return ExternalMcpConnectionSchema.parse({
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    serverUrl: row.server_url,
    trustTier: row.trust_tier,
    enabled: row.enabled === true || row.enabled === 1,
    serverIdentity: row.server_identity,
    manifestFingerprint: row.manifest_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function dbFor(locals: RuntimeLocals | App.Locals) {
  const db = await getTokenDb(locals);
  await db.execute(CREATE_TABLE_SQL);
  return db;
}

export async function listExternalMcpConnections(input: {
  locals: RuntimeLocals | App.Locals;
  siteId: string;
}): Promise<ExternalMcpConnection[]> {
  const db = await dbFor(input.locals);
  const rows = await db.queryAll(
    `SELECT * FROM aria_mcp_connections WHERE site_id = ? ORDER BY name`,
    [z.string().min(1).parse(input.siteId)],
  );
  return rows.map(rowToConnection);
}

export async function createExternalMcpConnection(input: {
  locals: RuntimeLocals | App.Locals;
  siteId: string;
  value: z.input<typeof CreateExternalMcpConnectionInputSchema>;
}): Promise<ExternalMcpConnection> {
  const value = CreateExternalMcpConnectionInputSchema.parse(input.value);
  const siteId = z.string().min(1).parse(input.siteId);
  const db = await dbFor(input.locals);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO aria_mcp_connections
     (id, site_id, name, server_url, trust_tier, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'read_only', 0, ?, ?)`,
    [id, siteId, value.name, value.serverUrl, now, now],
  );
  const row = await db.queryFirst(
    `SELECT * FROM aria_mcp_connections WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) throw new Error("MCP connection was not created");
  return rowToConnection(row);
}

export async function updateExternalMcpConnection(input: {
  locals: RuntimeLocals | App.Locals;
  siteId: string;
  value: z.input<typeof UpdateExternalMcpConnectionInputSchema>;
}): Promise<ExternalMcpConnection> {
  const value = UpdateExternalMcpConnectionInputSchema.parse(input.value);
  const siteId = z.string().min(1).parse(input.siteId);
  const db = await dbFor(input.locals);
  const current = await db.queryFirst(
    `SELECT * FROM aria_mcp_connections WHERE id = ? AND site_id = ? LIMIT 1`,
    [value.id, siteId],
  );
  if (!current) throw new Error("MCP connection not found");
  const parsed = rowToConnection(current);
  if (value.enabled === true && !parsed.manifestFingerprint) {
    throw new Error(
      "MCP connection must be discovered and approved before it can be enabled",
    );
  }
  await db.execute(
    `UPDATE aria_mcp_connections SET name = ?, enabled = ?, updated_at = ?
     WHERE id = ? AND site_id = ?`,
    [
      value.name ?? parsed.name,
      (value.enabled ?? parsed.enabled) ? 1 : 0,
      new Date().toISOString(),
      value.id,
      siteId,
    ],
  );
  const row = await db.queryFirst(
    `SELECT * FROM aria_mcp_connections WHERE id = ? LIMIT 1`,
    [value.id],
  );
  if (!row) throw new Error("MCP connection not found");
  return rowToConnection(row);
}

export async function deleteExternalMcpConnection(input: {
  locals: RuntimeLocals | App.Locals;
  siteId: string;
  value: z.input<typeof DeleteExternalMcpConnectionInputSchema>;
}): Promise<boolean> {
  const value = DeleteExternalMcpConnectionInputSchema.parse(input.value);
  const siteId = z.string().min(1).parse(input.siteId);
  const db = await dbFor(input.locals);
  const existing = await db.queryFirst(
    `SELECT id FROM aria_mcp_connections WHERE id = ? AND site_id = ? LIMIT 1`,
    [value.id, siteId],
  );
  if (!existing) return false;
  await db.execute(
    `DELETE FROM aria_mcp_connections WHERE id = ? AND site_id = ?`,
    [value.id, siteId],
  );
  return true;
}

export async function saveExternalMcpManifestIdentity(input: {
  locals: RuntimeLocals | App.Locals;
  siteId: string;
  connectionId: string;
  serverIdentity: string;
  manifestFingerprint: string;
}): Promise<ExternalMcpConnection> {
  const siteId = z.string().min(1).parse(input.siteId);
  const connectionId = z.uuid().parse(input.connectionId);
  const serverIdentity = z.string().min(1).parse(input.serverIdentity);
  const manifestFingerprint = z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .parse(input.manifestFingerprint);
  const db = await dbFor(input.locals);
  await db.execute(
    `UPDATE aria_mcp_connections
     SET server_identity = ?, manifest_fingerprint = ?, enabled = 0, updated_at = ?
     WHERE id = ? AND site_id = ?`,
    [
      serverIdentity,
      manifestFingerprint,
      new Date().toISOString(),
      connectionId,
      siteId,
    ],
  );
  const row = await db.queryFirst(
    `SELECT * FROM aria_mcp_connections WHERE id = ? AND site_id = ? LIMIT 1`,
    [connectionId, siteId],
  );
  if (!row) throw new Error("MCP connection not found");
  return rowToConnection(row);
}
