import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";
import { getTokenDb } from "../mcp/tokenDb";

export interface ActivityLogInput {
  locals: RuntimeLocals | App.Locals;
  actor: string;
  transport: string;
  toolName: string;
  resource?: string | null;
  status: "success" | "error";
  message?: string | null;
}

export async function logAgentActivity(input: ActivityLogInput): Promise<void> {
  const tokenDb = await getTokenDb(input.locals);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await tokenDb.execute(
      `INSERT INTO aria_agent_activity
       (id, actor, transport, tool_name, resource, status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.actor,
        input.transport,
        input.toolName,
        input.resource ?? null,
        input.status,
        input.message ?? null,
        createdAt,
      ],
    );
  } catch {
    // Activity logging must not break tool execution.
  }
}
