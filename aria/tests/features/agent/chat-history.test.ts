import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { mapUiMessagesToAgentChatMessages } from "../../../admin/features/Agent/lib/chatHistory";
import {
  AgentChatHistoryResponseSchema,
  AgentClearChatResponseSchema,
  LocalChatHistorySchema,
} from "../../../admin/features/Agent/lib/schemas";

describe("mapUiMessagesToAgentChatMessages", () => {
  it("maps text parts and timestamps into strict chat messages", () => {
    const uiMessages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hi there" }],
      },
    ];

    const timestamps = new Map<string, string>([
      ["user-1", "2026-06-12T12:00:00.000Z"],
      ["assistant-1", "2026-06-12T12:00:01.000Z"],
    ]);

    const messages = mapUiMessagesToAgentChatMessages(uiMessages, timestamps);
    expect(messages).toEqual([
      {
        id: "user-1",
        role: "user",
        content: "Hello",
        createdAt: "2026-06-12T12:00:00.000Z",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "Hi there",
        createdAt: "2026-06-12T12:00:01.000Z",
      },
    ]);
  });

  it("skips unsupported roles", () => {
    const uiMessages = [
      {
        id: "tool-1",
        role: "data",
        parts: [{ type: "text", text: "ignored" }],
      },
    ] as unknown as UIMessage[];

    expect(mapUiMessagesToAgentChatMessages(uiMessages)).toEqual([]);
  });

  it("removes internal tool narration from restored assistant history", () => {
    const messages = mapUiMessagesToAgentChatMessages([
      {
        id: "assistant-internal",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I updated the landing page. The insert_nodes call succeeded.",
          },
        ],
      },
    ]);

    expect(messages[0]?.content).toBe("I updated the landing page.");
  });
});

describe("history response schemas", () => {
  it("parses chat history response", () => {
    const parsed = AgentChatHistoryResponseSchema.parse({
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          content: "Hello",
          createdAt: "2026-06-12T12:00:00.000Z",
        },
      ],
      syncedAt: "2026-06-12T12:00:01.000Z",
    });
    expect(parsed.messages.length).toBe(1);
  });

  it("parses clear chat response", () => {
    const parsed = AgentClearChatResponseSchema.parse({
      cleared: true,
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed.cleared).toBe(true);
  });

  it("rejects invalid local chat history version", () => {
    const parsed = LocalChatHistorySchema.safeParse({
      version: 2,
      messages: [],
    });
    expect(parsed.success).toBe(false);
  });
});
