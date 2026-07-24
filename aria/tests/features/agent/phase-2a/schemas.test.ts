import { describe, expect, it } from "vitest";
import {
  AgentSyncChatHistoryInputSchema,
  INFERENCE_PROVIDER_CONFIG_DEFAULT,
  InferenceProviderConfigSchema,
  InferenceStreamChunkSchema,
  InferenceStreamPartSchema,
  ProviderRetryStateSchema,
  SESSION_CHAT_MESSAGE_ROW_VERSION,
  SessionChatHistorySchema,
  SessionChatMessageRowSchema,
  redactProviderConfig,
} from "../../../../admin/features/Agent/lib/schemas";

describe("InferenceProviderConfigSchema", () => {
  it("accepts minimal config (apiKey omitted)", () => {
    const result = InferenceProviderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBeUndefined();
      expect(result.data.configured).toBe(false);
    }
  });

  it("accepts config with baseUrl and configured flag", () => {
    const result = InferenceProviderConfigSchema.safeParse({
      baseUrl: "https://api.example.com/v1",
      configured: true,
      updatedAt: "2026-06-20T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("https://api.example.com/v1");
      expect(result.data.configured).toBe(true);
    }
  });

  it("rejects apiKey as a string", () => {
    const result = InferenceProviderConfigSchema.safeParse({
      apiKey: "sk-abc123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts apiKey as undefined explicitly", () => {
    const result = InferenceProviderConfigSchema.safeParse({
      apiKey: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields", () => {
    const result = InferenceProviderConfigSchema.safeParse({
      extraField: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-url baseUrl", () => {
    const result = InferenceProviderConfigSchema.safeParse({
      baseUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("provides working default constant", () => {
    expect(INFERENCE_PROVIDER_CONFIG_DEFAULT.configured).toBe(false);
    expect(INFERENCE_PROVIDER_CONFIG_DEFAULT.apiKey).toBeUndefined();
  });
});

describe("redactProviderConfig", () => {
  it("replaces apiKey with [REDACTED]", () => {
    const redacted = redactProviderConfig({ apiKey: "sk-secret", foo: "bar" });
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.foo).toBe("bar");
  });

  it("handles config without apiKey", () => {
    const redacted = redactProviderConfig({ foo: "bar" });
    expect(redacted.foo).toBe("bar");
    expect(redacted.apiKey).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const input = { apiKey: "sk-secret" };
    const redacted = redactProviderConfig(input);
    expect(input.apiKey).toBe("sk-secret");
    expect(redacted.apiKey).toBe("[REDACTED]");
  });

  it("handles empty config", () => {
    expect(redactProviderConfig({})).toEqual({});
  });
});

describe("InferenceStreamPartSchema", () => {
  it("accepts text-delta part", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "text-delta",
      delta: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts reasoning part", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "reasoning",
      delta: "thinking...",
    });
    expect(result.success).toBe(true);
  });

  it("accepts tool-call part", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "aria_read_page",
      args: { slug: "home" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tool-result part", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "aria_read_page",
      result: { title: "Home" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts error part", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "error",
      error: "Provider returned 503",
    });
    expect(result.success).toBe(true);
  });

  it("accepts finish part with usage", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "finish",
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts finish part without usage", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "finish",
      finishReason: "tool-calls",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown finishReason", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "finish",
      finishReason: "bogus",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown type", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "unknown-type",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields on text-delta", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "text-delta",
      delta: "Hi",
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing delta on text-delta", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "text-delta",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative token counts", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "finish",
      finishReason: "stop",
      usage: { promptTokens: -1, completionTokens: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects tool-call with empty toolCallId", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "tool-call",
      toolCallId: "",
      toolName: "read",
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects tool-call with empty toolName", () => {
    const result = InferenceStreamPartSchema.safeParse({
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "",
      args: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("InferenceStreamChunkSchema", () => {
  it("wraps a valid part with index", () => {
    const result = InferenceStreamChunkSchema.safeParse({
      index: 0,
      part: { type: "text-delta", delta: "Hi" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative index", () => {
    const result = InferenceStreamChunkSchema.safeParse({
      index: -1,
      part: { type: "text-delta", delta: "Hi" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid part inside wrapper", () => {
    const result = InferenceStreamChunkSchema.safeParse({
      index: 0,
      part: { type: "bogus" },
    });
    expect(result.success).toBe(false);
  });
});

describe("ProviderRetryStateSchema", () => {
  it("accepts minimal state with defaults", () => {
    const result = ProviderRetryStateSchema.safeParse({
      provider: "openai",
      modelId: "gpt-4",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attempt).toBe(1);
      expect(result.data.retryable).toBe(true);
    }
  });

  it("accepts full state", () => {
    const result = ProviderRetryStateSchema.safeParse({
      provider: "openai",
      modelId: "gpt-4",
      attempt: 2,
      lastError: "timeout",
      lastErrorAt: "2026-06-20T12:00:00.000Z",
      retryable: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects attempt > 3", () => {
    const result = ProviderRetryStateSchema.safeParse({
      provider: "openai",
      modelId: "gpt-4",
      attempt: 4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects attempt < 1", () => {
    const result = ProviderRetryStateSchema.safeParse({
      provider: "openai",
      modelId: "gpt-4",
      attempt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid provider backend", () => {
    const result = ProviderRetryStateSchema.safeParse({
      provider: "invalid",
      modelId: "gpt-4",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields", () => {
    const result = ProviderRetryStateSchema.safeParse({
      provider: "openai",
      modelId: "gpt-4",
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionChatMessageRowSchema", () => {
  const validRow = {
    version: 1 as const,
    id: "msg-1",
    sessionId: "session-1",
    userId: "user-1",
    role: "user" as const,
    content: "Hello",
    createdAt: "2026-06-20T12:00:00.000Z",
  };

  it("accepts valid row without toolCallId", () => {
    const result = SessionChatMessageRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it("accepts valid row with toolCallId", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      role: "tool",
      toolCallId: "call-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects future version", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      role: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-datetime createdAt", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      createdAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty sessionId", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      sessionId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      userId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields", () => {
    const result = SessionChatMessageRowSchema.safeParse({
      ...validRow,
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it("exports correct version constant", () => {
    expect(SESSION_CHAT_MESSAGE_ROW_VERSION).toBe(1);
  });
});

describe("SessionChatHistorySchema", () => {
  const validHistory = {
    version: 1 as const,
    sessionId: "session-1",
    userId: "user-1",
    messages: [
      {
        version: 1 as const,
        id: "msg-1",
        sessionId: "session-1",
        userId: "user-1",
        role: "user" as const,
        content: "Hello",
        createdAt: "2026-06-20T12:00:00.000Z",
      },
    ],
    updatedAt: "2026-06-20T12:00:01.000Z",
  };

  it("accepts valid history with one message", () => {
    const result = SessionChatHistorySchema.safeParse(validHistory);
    expect(result.success).toBe(true);
  });

  it("rejects messages exceeding AGENT_MAX_MESSAGES (250)", () => {
    const messages = Array.from({ length: 251 }, (_, i) => ({
      version: 1 as const,
      id: `msg-${i}`,
      sessionId: "session-1",
      userId: "user-1",
      role: "user" as const,
      content: `Message ${i}`,
      createdAt: new Date().toISOString(),
    }));
    const result = SessionChatHistorySchema.safeParse({
      ...validHistory,
      messages,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty messages array (fresh session)", () => {
    const result = SessionChatHistorySchema.safeParse({
      ...validHistory,
      messages: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields", () => {
    const result = SessionChatHistorySchema.safeParse({
      ...validHistory,
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentSyncChatHistoryInputSchema", () => {
  it("accepts valid messages", () => {
    const result = AgentSyncChatHistoryInputSchema.safeParse({
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          content: "Hello",
          createdAt: "2026-06-20T12:00:00.000Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty messages", () => {
    const result = AgentSyncChatHistoryInputSchema.safeParse({
      messages: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields", () => {
    const result = AgentSyncChatHistoryInputSchema.safeParse({
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          content: "Hello",
          createdAt: "2026-06-20T12:00:00.000Z",
        },
      ],
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});
