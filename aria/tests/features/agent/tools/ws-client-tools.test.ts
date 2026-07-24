import { describe, expect, it } from "vitest";
import {
  buildClientToolSchemas,
  buildClientToolSchemasForRequest,
} from "../../../../admin/features/Agent/lib/clientToolSchemas";
import type { AgentShellContext } from "../../../../admin/features/Agent/lib/schemas";
import {
  buildAgentChatRequestBody,
  buildAgentToolResultPayload,
  buildAgentWsTurnStatusFrame,
  wsFrameToStreamEvent,
} from "../../../../admin/features/Agent/lib/wsChatProtocol";
import {
  extractPendingClientToolsFromGenerateSteps,
  extractPendingClientToolsFromParts,
} from "../../../../admin/features/Agent/lib/toolStream";
import {
  consumeStreamEvent,
  createStreamConsumerState,
} from "../../../../admin/features/Agent/lib/streamEventConsumer";

const composerShellContext: AgentShellContext = {
  mode: "composer",
  workspace: "composer",
  itemType: "page",
  itemSlug: "services",
  itemTitle: "Services",
  pageId: "services",
  selectedBlockId: null,
  blockCount: 1,
  canClientInsert: true,
  canClientNavigate: true,
};

const studioShellContext: AgentShellContext = {
  mode: "studio",
  workspace: "studio",
  itemType: null,
  itemSlug: null,
  itemTitle: null,
  pageId: null,
  selectedBlockId: null,
  blockCount: 0,
  canClientInsert: false,
  canClientNavigate: true,
};

describe("buildClientToolSchemas", () => {
  it("exposes no browser tools in Ask mode", () => {
    expect(
      buildClientToolSchemasForRequest(
        composerShellContext,
        undefined,
        "ask",
      ),
    ).toEqual([]);
  });

  it("includes canvas tools only when canClientInsert is true", () => {
    const composerSchemas = buildClientToolSchemas(composerShellContext);
    expect(composerSchemas.map((schema) => schema.name)).toEqual([
      "open_in_composer",
      "insert_designed_section",
      "insert_nodes",
      "select_block",
      "update_node_motion",
      "upload_custom_font",
    ]);

    const studioSchemas = buildClientToolSchemas(studioShellContext);
    expect(studioSchemas.map((schema) => schema.name)).toEqual([
      "open_in_composer",
    ]);
  });

  it("exposes JSON schema parameters for insert_nodes", () => {
    const insertSchema = buildClientToolSchemasForRequest(
      composerShellContext,
    ).find((schema) => schema.name === "insert_nodes");
    expect(insertSchema?.parameters?.type).toBe("object");
    expect(insertSchema?.parameters?.properties).toHaveProperty("nodes");
  });

  it("exposes JSON schema parameters for insert_designed_section", () => {
    const insertSchema = buildClientToolSchemasForRequest(
      composerShellContext,
    ).find((schema) => schema.name === "insert_designed_section");
    expect(insertSchema?.parameters?.type).toBe("object");
    expect(insertSchema?.parameters?.properties).toHaveProperty("node");
    expect(insertSchema?.parameters?.properties).not.toHaveProperty(
      "sectionType",
    );
    expect(insertSchema?.parameters?.properties).not.toHaveProperty("intent");
  });

  it("exposes JSON schema parameters for update_node_motion", () => {
    const motionSchema = buildClientToolSchemasForRequest(
      composerShellContext,
    ).find((schema) => schema.name === "update_node_motion");
    expect(motionSchema?.parameters?.type).toBe("object");
    expect(motionSchema?.parameters?.properties).toHaveProperty("blockId");
    expect(motionSchema?.parameters?.properties).toHaveProperty("motion");
  });
});

describe("buildAgentChatRequestBody", () => {
  it("includes clientTools in the WS request body when schemas are provided", () => {
    const body = JSON.parse(
      buildAgentChatRequestBody({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "add a hero",
            createdAt: new Date().toISOString(),
          },
        ],
        composerMode: "agent",
        shellContext: composerShellContext,
        clientToolSchemas: buildClientToolSchemas(composerShellContext),
      }),
    );

    expect(body.clientTools).toHaveLength(6);
    expect(body.clientTools[1]?.name).toBe("insert_designed_section");
  });
});

describe("buildAgentToolResultPayload", () => {
  it("matches the cf_agent_tool_result wire shape", () => {
    const payload = buildAgentToolResultPayload({
      toolCallId: "call-1",
      toolName: "insert_nodes",
      output: { ok: true, data: { inserted: 1 } },
      autoContinue: true,
      clientToolSchemas: buildClientToolSchemas(composerShellContext),
    });

    expect(payload).toEqual({
      type: "cf_agent_tool_result",
      toolCallId: "call-1",
      toolName: "insert_nodes",
      output: { ok: true, data: { inserted: 1 } },
      autoContinue: true,
      clientTools: buildClientToolSchemas(composerShellContext),
    });
  });
});

describe("buildAgentWsTurnStatusFrame", () => {
  it("builds the accepted, preparing, and generating protocol frames", () => {
    expect(
      ["accepted", "preparing", "generating"].map((phase) =>
        buildAgentWsTurnStatusFrame(
          "request-1",
          phase as "accepted" | "preparing" | "generating",
        ),
      ),
    ).toEqual([
      {
        type: "aria_agent_turn_status",
        id: "request-1",
        phase: "accepted",
      },
      {
        type: "aria_agent_turn_status",
        id: "request-1",
        phase: "preparing",
      },
      {
        type: "aria_agent_turn_status",
        id: "request-1",
        phase: "generating",
      },
    ]);
  });
});

describe("wsFrameToStreamEvent", () => {
  it("normalizes terminal server error frames", () => {
    const event = wsFrameToStreamEvent({
      type: "cf_agent_use_chat_response",
      id: "req-1",
      body: "Your agent connection needs to reconnect.",
      done: true,
      error: true,
    });

    expect(event).toEqual({
      type: "error",
      error: "Your agent connection needs to reconnect.",
    });
  });

  it("normalizes AI SDK text-delta chunks with extra metadata", () => {
    const event = wsFrameToStreamEvent({
      type: "cf_agent_use_chat_response",
      id: "req-1",
      body: JSON.stringify({
        type: "text-delta",
        id: "txt-1",
        delta: "Done.",
      }),
    });

    expect(event).toEqual({ type: "text-delta", delta: "Done." });
  });

  it("normalizes AI SDK tool-input-available chunks into tool-call events", () => {
    const toolNameByCallId = new Map<string, string>();
    const event = wsFrameToStreamEvent(
      {
        type: "cf_agent_use_chat_response",
        id: "req-1",
        body: JSON.stringify({
          type: "tool-input-available",
          toolCallId: "call-ws",
          toolName: "insert_nodes",
          input: { nodes: [{ id: "hero", type: "section" }] },
        }),
      },
      { toolNameByCallId },
    );

    expect(event).toEqual({
      type: "tool-call",
      toolCallId: "call-ws",
      toolName: "insert_nodes",
      args: { nodes: [{ id: "hero", type: "section" }] },
    });
    expect(toolNameByCallId.get("call-ws")).toBe("insert_nodes");
  });

  it("uses remembered tool names for AI SDK tool output chunks", () => {
    const event = wsFrameToStreamEvent(
      {
        type: "cf_agent_use_chat_response",
        id: "req-1",
        body: JSON.stringify({
          type: "tool-output-available",
          toolCallId: "call-ws",
          output: { ok: true },
        }),
      },
      { toolNameByCallId: new Map([["call-ws", "aria_read_page"]]) },
    );

    expect(event).toEqual({
      type: "tool-result",
      toolCallId: "call-ws",
      toolName: "aria_read_page",
      result: { ok: true },
    });
  });

  it("does not dump enormous invalid tool payloads into the agent panel", () => {
    const event = wsFrameToStreamEvent({
      type: "cf_agent_use_chat_response",
      id: "req-1",
      body: JSON.stringify({
        type: "tool-input-error",
        toolName: "aria_insert_nodes",
        errorText: `Invalid input. Value: ${"x".repeat(2_000)}`,
      }),
    });

    expect(event).toEqual({
      type: "error",
      error:
        "aria_insert_nodes: Tool input was invalid and could not be repaired.",
    });
  });

  it("normalizes AI SDK finish chunks with optional finish reasons", () => {
    const event = wsFrameToStreamEvent({
      type: "cf_agent_use_chat_response",
      id: "req-1",
      body: JSON.stringify({
        type: "finish",
        finishReason: "tool-calls",
        messageMetadata: { ignored: true },
      }),
    });

    expect(event).toEqual({
      type: "finish",
      finishReason: "tool-calls",
    });
  });
});

describe("consumeStreamEvent", () => {
  it("dedupes replayed client tool calls by toolCallId", () => {
    const state = createStreamConsumerState();
    const event = {
      type: "tool-call" as const,
      toolCallId: "call-replayed",
      toolName: "insert_nodes",
      args: { nodes: [] },
    };

    consumeStreamEvent(state, event);
    consumeStreamEvent(state, event);

    expect(state.toolSteps).toHaveLength(1);
    expect(state.pendingClientTools).toHaveLength(1);
  });

  it("removes completed client calls before the continuation stream", () => {
    const state = createStreamConsumerState();
    consumeStreamEvent(state, {
      type: "tool-call",
      toolCallId: "call-insert",
      toolName: "insert_designed_section",
      args: { node: {} },
    });

    consumeStreamEvent(state, {
      type: "tool-result",
      toolCallId: "call-insert",
      toolName: "insert_designed_section",
      result: { ok: true },
    });

    expect(state.pendingClientTools).toEqual([]);
    expect(state.toolSteps[0]?.status).toBe("success");
  });
});

describe("extractPendingClientToolsFromParts", () => {
  it("detects native input-available insert_nodes parts", () => {
    const parts = [
      {
        type: "tool-insert_nodes",
        toolCallId: "call-native",
        toolName: "insert_nodes",
        state: "input-available",
        input: { nodes: [{ id: "n1", type: "section", data: {} }] },
      },
    ] as const;

    const pending = extractPendingClientToolsFromParts(parts);
    expect(pending).toEqual([
      {
        toolName: "insert_nodes",
        toolCallId: "call-native",
        input: { nodes: [{ id: "n1", type: "section", data: {} }] },
      },
    ]);
  });
});

describe("extractPendingClientToolsFromGenerateSteps regression", () => {
  it("still extracts client tools from HTTP generate steps", () => {
    const steps = [
      {
        toolCalls: [
          {
            toolCallId: "call-http",
            toolName: "insert_nodes",
            input: { nodes: [] },
          },
        ],
        toolResults: [],
      },
    ] as unknown as Parameters<
      typeof extractPendingClientToolsFromGenerateSteps
    >[0];

    const pending = extractPendingClientToolsFromGenerateSteps(steps);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.toolCallId).toBe("call-http");
  });
});
