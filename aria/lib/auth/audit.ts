import type { AuthAdapter } from "./adapter";
import {
  NewAuthEventSchema,
  type AuthEventMetadata,
  type AuthEventType,
  type AuthMethod,
} from "./types";

const MAX_USER_AGENT_LENGTH = 512;

export interface LogAuthEventInput {
  userId?: string | null;
  eventType: AuthEventType;
  authMethod?: AuthMethod | null;
  ip?: string | null;
  userAgent?: string | null;
  success: boolean;
  metadata?: AuthEventMetadata | null;
}

function truncateUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}

export async function logAuthEvent(
  adapter: Pick<AuthAdapter, "createAuthEvent">,
  input: LogAuthEventInput,
): Promise<void> {
  try {
    const event = NewAuthEventSchema.parse({
      userId: input.userId ?? null,
      eventType: input.eventType,
      authMethod: input.authMethod ?? null,
      ip: input.ip ?? null,
      userAgent: truncateUserAgent(input.userAgent),
      success: input.success,
      metadata: input.metadata ?? null,
    });

    await adapter.createAuthEvent(event);
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "auth.audit",
        message: "Failed to record auth event",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
