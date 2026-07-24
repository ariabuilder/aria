import {
  InvalidToolInputError,
  NoSuchToolError,
  tool,
  type ToolSet,
} from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { repairCompactedAriaToolCall } from "../../../admin/features/Agent/lib/inference/toolCallRepair";

const tools = {
  aria_execute_command: tool({
    inputSchema: z.object({
      command: z.string(),
      input: z.unknown(),
    }),
  }),
  insert_nodes: tool({
    inputSchema: z.object({
      nodes: z.array(z.unknown()),
      parentId: z.string().nullable().optional(),
      insertPosition: z.number().optional(),
    }),
  }),
} satisfies ToolSet;

async function repair(toolName: string, input: string) {
  return repairCompactedAriaToolCall({
    error: new NoSuchToolError({
      toolName,
      availableTools: Object.keys(tools),
    }),
    toolCall: {
      type: "tool-call",
      toolCallId: "call-1",
      toolName,
      input,
    },
    tools,
    system: undefined,
    messages: [],
    inputSchema: async () => ({}),
  });
}

async function repairInvalid(toolName: string, input: string) {
  return repairCompactedAriaToolCall({
    error: new InvalidToolInputError({
      toolName,
      toolInput: input,
      cause: new Error("Type validation failed"),
    }),
    toolCall: {
      type: "tool-call",
      toolCallId: "call-invalid",
      toolName,
      input,
    },
    tools,
    system: undefined,
    messages: [],
    inputSchema: async () => ({}),
  });
}

describe("repairCompactedAriaToolCall", () => {
  it("routes a compacted Aria command through the capability executor", async () => {
    const repaired = await repair(
      "aria_create_class",
      JSON.stringify({ name: "hero" }),
    );

    expect(repaired).toMatchObject({
      toolCallId: "call-1",
      toolName: "aria_execute_command",
    });
    expect(JSON.parse(repaired?.input ?? "null")).toEqual({
      command: "aria_create_class",
      input: { name: "hero" },
    });
  });

  it("does not rewrite non-Aria hallucinations", async () => {
    await expect(repair("made_up_tool", "{}")).resolves.toBeNull();
  });

  it("does not hide malformed tool input", async () => {
    await expect(repair("aria_create_class", "{oops")).resolves.toBeNull();
  });

  it("routes server insertion to the live canvas and decodes stringified nodes", async () => {
    const repaired = await repair(
      "aria_insert_nodes",
      JSON.stringify({
        collection: "pages",
        slug: "home",
        nodes: JSON.stringify([{ type: "Section", children: [] }]),
      }),
    );

    expect(repaired?.toolName).toBe("insert_nodes");
    expect(JSON.parse(repaired?.input ?? "null")).toEqual({
      nodes: [{ type: "Section", children: [] }],
    });
  });

  it("repairs stringified node arrays for the client insertion tool", async () => {
    const repaired = await repairInvalid(
      "insert_nodes",
      JSON.stringify({
        nodes: JSON.stringify([{ type: "Section", children: [] }]),
      }),
    );

    expect(repaired?.toolName).toBe("insert_nodes");
    expect(JSON.parse(repaired?.input ?? "null")).toEqual({
      nodes: [{ type: "Section", children: [] }],
    });
  });
});
