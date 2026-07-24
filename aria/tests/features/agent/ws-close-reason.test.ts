import { describe, expect, it } from "vitest";
import {
  agentWsCloseReasonMessage,
  AGENT_WS_CLOSE_FORBIDDEN,
  AGENT_WS_CLOSE_SESSION_EXPIRED,
  AGENT_WS_CLOSE_UNAUTHORIZED,
  parseAgentWsCloseCode,
} from "../../../admin/features/Agent/lib/wsCloseReason";

describe("ws close reasons", () => {
  it("maps structured close codes to reasons", () => {
    expect(parseAgentWsCloseCode(AGENT_WS_CLOSE_UNAUTHORIZED)).toBe(
      "unauthorized",
    );
    expect(parseAgentWsCloseCode(AGENT_WS_CLOSE_SESSION_EXPIRED)).toBe(
      "session_expired",
    );
    expect(parseAgentWsCloseCode(AGENT_WS_CLOSE_FORBIDDEN)).toBe("forbidden");
    expect(parseAgentWsCloseCode(1000)).toBeNull();
  });

  it("returns user-facing messages", () => {
    expect(agentWsCloseReasonMessage("session_expired")).toContain("Sign in");
    expect(agentWsCloseReasonMessage("forbidden")).toContain("permission");
  });
});
