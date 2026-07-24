import { describe, expect, it } from "vitest";
import {
  sanitizeAgentUserFacingContent,
  sanitizeAgentUserFacingError,
  sanitizeAgentUserFacingMessages,
} from "../../../admin/features/Agent/lib/userFacingContent";

describe("agent user-facing content", () => {
  it("leaves ordinary user-oriented responses untouched", () => {
    const content =
      "I added a focused editorial hero and preserved your existing article feed.\n\nThe page now leads readers from the newest story into the archive.";

    expect(sanitizeAgentUserFacingContent(content)).toBe(content);
  });

  it("removes implementation narration and internal identifiers", () => {
    const content =
      "Let me try a fresh approach — I'll use `insert_nodes` with inline styles since we're on custom classes mode. Let me first check what's on the page now.Good — the page already has its article feed connected. Let me build a proper editorial landing page. I'll insert designed sections through the creation API right now. Let me start with the hero section:";

    expect(sanitizeAgentUserFacingContent(content)).toBe(
      "Good — the page already has its article feed connected.",
    );
  });

  it("keeps an outcome while dropping a tool-specific follow-up", () => {
    expect(
      sanitizeAgentUserFacingContent(
        "I updated the hero and article grid. The aria_insert_nodes call succeeded.",
      ),
    ).toBe("I updated the hero and article grid.");
  });

  it("sanitizes only assistant messages in restored history", () => {
    const messages = sanitizeAgentUserFacingMessages([
      {
        id: "user-1",
        role: "user",
        content: "Why did insert_nodes fail?",
        createdAt: "2026-07-19T12:00:00.000Z",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "The insert_nodes tool input failed. I couldn't finish the update.",
        createdAt: "2026-07-19T12:00:01.000Z",
      },
    ]);

    expect(messages[0]?.content).toBe("Why did insert_nodes fail?");
    expect(messages[1]?.content).toBe("I couldn't finish the update.");
  });

  it("uses a neutral fallback when an error is entirely internal", () => {
    expect(
      sanitizeAgentUserFacingError(
        "aria_insert_nodes: Tool input was invalid and could not be repaired.",
      ),
    ).toBe("I couldn't complete this step. Please try again.");
  });
});
