import { z } from "zod";

export const AgentWsCloseCodeSchema = z.union([
  z.literal(4401),
  z.literal(4402),
  z.literal(4403),
]);

export type AgentWsCloseCode = z.infer<typeof AgentWsCloseCodeSchema>;

export const AgentWsCloseReasonSchema = z.enum([
  "unauthorized",
  "session_expired",
  "forbidden",
  "agent_unavailable",
]);

export type AgentWsCloseReason = z.infer<typeof AgentWsCloseReasonSchema>;

export const AGENT_WS_CLOSE_UNAUTHORIZED = 4401 as const;
export const AGENT_WS_CLOSE_SESSION_EXPIRED = 4402 as const;
export const AGENT_WS_CLOSE_FORBIDDEN = 4403 as const;

const CLOSE_CODE_TO_REASON: Record<AgentWsCloseCode, AgentWsCloseReason> = {
  4401: "unauthorized",
  4402: "session_expired",
  4403: "forbidden",
};

export function parseAgentWsCloseCode(code: number): AgentWsCloseReason | null {
  const parsed = AgentWsCloseCodeSchema.safeParse(code);
  if (!parsed.success) {
    return null;
  }

  return CLOSE_CODE_TO_REASON[parsed.data];
}

export function agentWsCloseReasonMessage(reason: AgentWsCloseReason): string {
  switch (reason) {
    case "unauthorized":
      return "Session expired. Sign in again to continue.";
    case "session_expired":
      return "Session expired. Sign in again to continue.";
    case "forbidden":
      return "You do not have permission to use Aria Engineer.";
    case "agent_unavailable":
      return "Aria Engineer is temporarily unavailable.";
  }
}

export const AgentWsCloseFrameSchema = z
  .object({
    code: AgentWsCloseCodeSchema,
    reason: AgentWsCloseReasonSchema.optional(),
    message: z.string().min(1).optional(),
  })
  .strict();
