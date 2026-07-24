import { z } from "zod";
import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";
import { getTokenDb } from "../mcp/tokenDb";
import { readResourceForTool } from "../tools/content/readResource";
import type { AgentToolActionContext, ToolContext } from "../tools/types";
import { isServerToolName } from "../tools/constants";
import { supportsExactAgentUndo } from "./reversibility";

const DocumentCollectionSchema = z.enum(["pages", "layouts", "components"]);
const ResourceMutationArgsSchema = z
  .object({
    collection: DocumentCollectionSchema,
    slug: z.string().min(1),
  })
  .loose();

const DocumentSnapshotSchema = z
  .object({
    title: z.string().optional(),
    nodes: z.array(z.unknown()),
    version: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .loose();

const PendingMutationSchema = z
  .object({
    id: z.uuid(),
    siteId: z.string().min(1),
    actorId: z.string().min(1),
    toolName: z.string().min(1),
    collection: DocumentCollectionSchema,
    slug: z.string().min(1),
    beforeVersion: z.string().min(1).nullable(),
    inverseToolName: z.literal("aria_save_document"),
    inverseArgs: z.unknown(),
  })
  .strict();
export type PendingMutation = z.infer<typeof PendingMutationSchema>;

export const UndoMutationInputSchema = z.object({ id: z.uuid() }).strict();

export const UndoMutationRecordSchema = z
  .object({
    id: z.uuid(),
    siteId: z.string().min(1),
    actorId: z.string().min(1),
    toolName: z.string().min(1),
    resourceKey: z.string().min(1),
    afterVersion: z.string().min(1).nullable(),
    inverseToolName: z.literal("aria_save_document"),
    inverseArgs: z.unknown(),
    status: z.enum(["ready", "undone"]),
  })
  .strict();
export type UndoMutationRecord = z.infer<typeof UndoMutationRecordSchema>;

const ENSURE_MUTATION_TABLE_SQL = `CREATE TABLE IF NOT EXISTS aria_agent_mutations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  resource_key TEXT,
  before_version TEXT,
  after_version TEXT,
  reversibility TEXT NOT NULL,
  inverse_tool_name TEXT,
  inverse_args_json TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  undone_at TEXT,
  created_at TEXT NOT NULL
)`;

function snapshotVersion(snapshot: z.infer<typeof DocumentSnapshotSchema>) {
  return snapshot.version ?? snapshot.updatedAt ?? null;
}

async function readDocumentSnapshot(
  actionContext: AgentToolActionContext,
  collection: z.infer<typeof DocumentCollectionSchema>,
  slug: string,
) {
  const read = await readResourceForTool(actionContext, {
    collection,
    slug,
    target: "draft",
  });
  return read.ok ? DocumentSnapshotSchema.parse(read.data) : null;
}

export async function captureMutationBeforeExecution(input: {
  toolContext: ToolContext;
  actionContext: AgentToolActionContext;
  toolName: string;
  args: unknown;
}): Promise<PendingMutation | null> {
  if (
    !isServerToolName(input.toolName) ||
    !supportsExactAgentUndo(input.toolName)
  ) {
    return null;
  }
  const args = ResourceMutationArgsSchema.safeParse(input.args);
  if (!args.success) return null;
  const snapshot = await readDocumentSnapshot(
    input.actionContext,
    args.data.collection,
    args.data.slug,
  );
  if (!snapshot) return null;
  return PendingMutationSchema.parse({
    id: crypto.randomUUID(),
    siteId: input.toolContext.siteId,
    actorId: input.toolContext.userId ?? input.toolContext.actorLabel,
    toolName: input.toolName,
    collection: args.data.collection,
    slug: args.data.slug,
    beforeVersion: snapshotVersion(snapshot),
    inverseToolName: "aria_save_document",
    inverseArgs: {
      collection: args.data.collection,
      slug: args.data.slug,
      title: snapshot.title,
      nodes: snapshot.nodes,
    },
  });
}

export async function commitMutationAfterExecution(input: {
  locals: RuntimeLocals | App.Locals;
  actionContext: AgentToolActionContext;
  pending: PendingMutation | null;
}): Promise<void> {
  if (!input.pending) return;
  const after = await readDocumentSnapshot(
    input.actionContext,
    input.pending.collection,
    input.pending.slug,
  );
  const db = await getTokenDb(input.locals);
  await db.execute(ENSURE_MUTATION_TABLE_SQL);
  await db.execute(
    `INSERT INTO aria_agent_mutations
     (id, site_id, actor_id, tool_name, resource_key, before_version,
      after_version, reversibility, inverse_tool_name, inverse_args_json,
      status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'exact', ?, ?, 'ready', ?)`,
    [
      input.pending.id,
      input.pending.siteId,
      input.pending.actorId,
      input.pending.toolName,
      `${input.pending.collection}:${input.pending.slug}`,
      input.pending.beforeVersion,
      after ? snapshotVersion(after) : null,
      input.pending.inverseToolName,
      JSON.stringify(input.pending.inverseArgs),
      new Date().toISOString(),
    ],
  );
}

export async function loadUndoMutation(input: {
  locals: RuntimeLocals | App.Locals;
  siteId: string;
  actorId: string;
  mutationId: string;
}): Promise<UndoMutationRecord | null> {
  const db = await getTokenDb(input.locals);
  await db.execute(ENSURE_MUTATION_TABLE_SQL);
  const row = await db.queryFirst(
    `SELECT * FROM aria_agent_mutations
     WHERE id = ? AND site_id = ? AND actor_id = ? LIMIT 1`,
    [input.mutationId, input.siteId, input.actorId],
  );
  if (!row) return null;
  const RowSchema = z
    .object({
      id: z.string(),
      site_id: z.string(),
      actor_id: z.string(),
      tool_name: z.string(),
      resource_key: z.string(),
      after_version: z.string().nullable(),
      inverse_tool_name: z.string(),
      inverse_args_json: z.string(),
      status: z.string(),
    })
    .loose();
  const parsed = RowSchema.parse(row);
  const inverseArgs: unknown = JSON.parse(parsed.inverse_args_json);
  return UndoMutationRecordSchema.parse({
    id: parsed.id,
    siteId: parsed.site_id,
    actorId: parsed.actor_id,
    toolName: parsed.tool_name,
    resourceKey: parsed.resource_key,
    afterVersion: parsed.after_version,
    inverseToolName: parsed.inverse_tool_name,
    inverseArgs,
    status: parsed.status,
  });
}

export async function assertUndoResourceUnchanged(input: {
  actionContext: AgentToolActionContext;
  record: UndoMutationRecord;
}): Promise<void> {
  const args = ResourceMutationArgsSchema.parse(input.record.inverseArgs);
  const current = await readDocumentSnapshot(
    input.actionContext,
    args.collection,
    args.slug,
  );
  if (!current || snapshotVersion(current) !== input.record.afterVersion) {
    throw new Error(
      "Undo refused because the document changed after the agent mutation.",
    );
  }
}

export async function markMutationUndone(input: {
  locals: RuntimeLocals | App.Locals;
  mutationId: string;
}): Promise<void> {
  const db = await getTokenDb(input.locals);
  await db.execute(
    `UPDATE aria_agent_mutations
     SET status = 'undone', undone_at = ?
     WHERE id = ? AND status = 'ready'`,
    [new Date().toISOString(), input.mutationId],
  );
}
