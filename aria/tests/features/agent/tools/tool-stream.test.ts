import { describe, expect, it } from "vitest";
import {
  extractPendingClientToolsFromParts,
  extractToolStepsFromStreamParts,
  isClientToolName,
  mergeToolSteps,
  applyClientToolResultToSteps,
} from "../../../../admin/features/Agent/lib/toolStream";

describe("toolStream", () => {
  it("detects client tool names", () => {
    expect(isClientToolName("insert_designed_section")).toBe(true);
    expect(isClientToolName("insert_nodes")).toBe(true);
    expect(isClientToolName("aria_read_page")).toBe(false);
  });

  it("extracts pending client tools from stream parts", () => {
    const parts = [
      {
        type: "tool-insert_nodes",
        toolCallId: "call-1",
        toolName: "insert_nodes",
        state: "output-available",
        input: { nodes: [{ id: "n1", type: "section", data: {} }] },
        output: { pendingClientExecution: true },
      },
      {
        type: "tool-aria_read_page",
        toolCallId: "call-2",
        toolName: "aria_read_page",
        state: "output-available",
        input: { slug: "home" },
        output: { slug: "home" },
      },
    ] as const;

    const pending = extractPendingClientToolsFromParts(parts);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.toolName).toBe("insert_nodes");
    expect(pending[0]?.toolCallId).toBe("call-1");
  });

  it("detects input-available client tools from native WS protocol", () => {
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
    expect(pending).toHaveLength(1);
    expect(pending[0]?.toolCallId).toBe("call-native");
  });

  it("builds tool steps from stream parts", () => {
    const parts = [
      {
        type: "tool-aria_list_pages",
        toolCallId: "call-3",
        toolName: "aria_list_pages",
        state: "output-available",
        input: {},
        output: { pages: [] },
      },
    ] as const;

    const steps = extractToolStepsFromStreamParts(parts);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.isReadTool).toBe(true);
    expect(steps[0]?.status).toBe("success");
  });

  it("merges and updates tool steps after client execution", () => {
    const initial = [
      {
        id: "call-1",
        toolName: "insert_nodes",
        status: "running" as const,
        isReadTool: false,
      },
    ];
    const merged = mergeToolSteps(initial, [
      {
        id: "call-2",
        toolName: "aria_read_page",
        status: "success",
        isReadTool: true,
      },
    ]);
    expect(merged).toHaveLength(2);

    const updated = applyClientToolResultToSteps(
      merged,
      "call-1",
      "insert_nodes",
      { ok: true, data: { inserted: 1 } },
    );
    expect(updated.find((step) => step.id === "call-1")?.status).toBe(
      "success",
    );
  });

  it("does not regress a completed client tool to running", () => {
    const merged = mergeToolSteps(
      [
        {
          id: "call-client",
          toolName: "insert_designed_section",
          status: "success",
          summary: "Done",
          isReadTool: false,
        },
      ],
      [
        {
          id: "call-client",
          toolName: "insert_designed_section",
          status: "running",
          isReadTool: false,
        },
      ],
    );

    expect(merged[0]).toMatchObject({ status: "success", summary: "Done" });
  });
});
