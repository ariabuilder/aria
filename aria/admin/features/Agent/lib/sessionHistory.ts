import { AGENT_MAX_MESSAGES } from "./constants";
import { AgentChatMessageSchema, type AgentChatMessage } from "./schemas";

// Minimal type for the D1Database subset we use.
// In Cloudflare Workers this is `D1Database` from @cloudflare/workers-types.
interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<void>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export interface SessionHistoryAdapter {
  /** Read messages for a session. Returns empty array on miss. */
  read(sessionId: string, userId: string): Promise<AgentChatMessage[]>;
  /** Write messages for a session. Prunes to AGENT_MAX_MESSAGES. */
  write(
    sessionId: string,
    userId: string,
    messages: readonly AgentChatMessage[],
  ): Promise<void>;
  clear(sessionId: string, userId: string): Promise<void>;
}

/**
 * D1-backed session history adapter.
 * Stores messages in a D1 table `agent_session_messages`.
 */
export class D1SessionHistoryAdapter implements SessionHistoryAdapter {
  constructor(private db: D1Database) {}

  async read(sessionId: string, userId: string): Promise<AgentChatMessage[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, user_id, role, content, created_at, tool_call_id
         FROM agent_session_messages
         WHERE session_id = ? AND user_id = ?
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .bind(sessionId, userId, AGENT_MAX_MESSAGES)
      .all<{
        id: string;
        user_id: string;
        role: string;
        content: string;
        created_at: string;
        tool_call_id: string | null;
      }>();

    if (!rows.results) return [];

    const messages: AgentChatMessage[] = [];

    for (const row of rows.results) {
      try {
        const parsed = AgentChatMessageSchema.parse({
          id: row.id,
          role: row.role,
          content: row.content,
          createdAt: row.created_at,
          ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
        });
        messages.push(parsed);
      } catch {
        // Corrupt row — skip, don't crash session
        continue;
      }
    }

    return messages;
  }

  async write(
    sessionId: string,
    userId: string,
    messages: readonly AgentChatMessage[],
  ): Promise<void> {
    // Filter to user/assistant/system only (tool messages are transient)
    const persistable = messages.filter((m) => m.role !== "tool");

    // Prune to max
    const pruned =
      persistable.length > AGENT_MAX_MESSAGES
        ? persistable.slice(-AGENT_MAX_MESSAGES)
        : persistable;

    // Batch insert via transaction: delete existing, then re-insert
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `DELETE FROM agent_session_messages WHERE session_id = ? AND user_id = ?`,
        )
        .bind(sessionId, userId),
    ];

    for (const msg of pruned) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO agent_session_messages
               (id, session_id, user_id, role, content, created_at, tool_call_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            msg.id,
            sessionId,
            userId,
            msg.role,
            msg.content,
            msg.createdAt,
            msg.toolCallId ?? null,
          ),
      );
    }

    await this.db.batch(statements);
  }

  async clear(sessionId: string, userId: string): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM agent_session_messages WHERE session_id = ? AND user_id = ?`,
      )
      .bind(sessionId, userId)
      .run();
  }
}

/**
 * Create the agent_session_messages table if it doesn't exist.
 * Called at startup or on first access.
 */
export async function ensureSessionHistoryTable(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      tool_call_id TEXT,
      version INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_agent_session_messages_lookup
      ON agent_session_messages (session_id, user_id, created_at);
  `);
}

/**
 * Resolve the appropriate session history adapter based on available bindings.
 * Falls back to null when no D1 is available (caller uses localStorage).
 */
export async function resolveSessionHistoryAdapter(
  locals?: unknown,
): Promise<SessionHistoryAdapter | null> {
  if (!locals) return null;

  try {
    // Check for D1 binding in either cfBindings or runtime.env
    const localsRecord = locals as Record<string, unknown>;
    const cfBindings = localsRecord.cfBindings;
    const runtime = localsRecord.runtime;
    const runtimeEnv =
      runtime && typeof runtime === "object"
        ? (runtime as Record<string, unknown>).env
        : undefined;
    const env =
      cfBindings && typeof cfBindings === "object"
        ? (cfBindings as Record<string, unknown>)
        : runtimeEnv && typeof runtimeEnv === "object"
          ? (runtimeEnv as Record<string, unknown>)
          : undefined;

    const db = env?.aria_db as D1Database | undefined;
    if (db) {
      await ensureSessionHistoryTable(db);
      return new D1SessionHistoryAdapter(db);
    }
  } catch {
    // No D1 available — return null (caller falls back to localStorage)
  }

  return null;
}
