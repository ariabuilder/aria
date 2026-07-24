import { describe, expect, it, vi } from "vitest";
import {
  buildDeferredSectionInsertionResult,
  createProgressiveSectionInsertionGate,
  executeClientToolCallOnce,
  hasBatchedRootSectionInsertions,
  isProgressiveSectionInsertTool,
} from "../../../admin/features/Agent/lib/progressiveBuild";

describe("progressive section building", () => {
  it("allows only one successful section insertion per continuation", () => {
    const gate = createProgressiveSectionInsertionGate();

    expect(gate.shouldDefer("insert_designed_section")).toBe(false);
    gate.recordResult("insert_designed_section", true);
    expect(gate.shouldDefer("insert_designed_section")).toBe(true);
    expect(gate.shouldDefer("select_block")).toBe(false);
    expect(buildDeferredSectionInsertionResult()).toMatchObject({
      ok: true,
      data: { deferred: true, inserted: 0 },
    });
  });

  it("recognizes the low-level fallback only when it inserts one root section", () => {
    expect(
      isProgressiveSectionInsertTool("insert_nodes", {
        nodes: [{ id: "hero", type: "Section", children: [] }],
      }),
    ).toBe(true);
    expect(
      isProgressiveSectionInsertTool("insert_nodes", {
        nodes: [
          { id: "hero", type: "Section", children: [] },
          { id: "cta", type: "Section", children: [] },
        ],
      }),
    ).toBe(false);
    expect(
      hasBatchedRootSectionInsertions("insert_nodes", {
        nodes: [
          { id: "hero", type: "Section", children: [] },
          { id: "cta", type: "Section", children: [] },
        ],
      }),
    ).toBe(true);
    expect(
      isProgressiveSectionInsertTool("insert_nodes", {
        nodes: [{ id: "text", type: "Text", children: [] }],
      }),
    ).toBe(false);
  });

  it("completes six sequential continuations after each insertion lands", async () => {
    const inserted: number[] = [];
    const requestNextContinuation = vi.fn();

    for (let sequence = 1; sequence <= 6; sequence += 1) {
      const gate = createProgressiveSectionInsertionGate();
      expect(gate.shouldDefer("insert_designed_section")).toBe(false);

      inserted.push(sequence);
      gate.recordResult("insert_designed_section", true);
      await Promise.resolve();
      requestNextContinuation([...inserted]);
    }

    expect(requestNextContinuation.mock.calls).toEqual([
      [[1]],
      [[1, 2]],
      [[1, 2, 3]],
      [[1, 2, 3, 4]],
      [[1, 2, 3, 4, 5]],
      [[1, 2, 3, 4, 5, 6]],
    ]);
  });

  it("reuses a completed tool result when a stream replays the same call ID", async () => {
    const results = new Map<string, { ok: true; nodeId: string }>();
    const execute = vi.fn(async () => ({ ok: true as const, nodeId: "hero" }));

    const first = await executeClientToolCallOnce(results, "call-1", execute);
    const replay = await executeClientToolCallOnce(results, "call-1", execute);

    expect(first).toBe(replay);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
