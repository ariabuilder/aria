import { describe, expect, it } from "vitest";
import { resolveInsertPosition } from "../../../admin/features/Nodes/events/shared/insertNodeViaAction";
import { findNodeById } from "../../../lib/blocks/nodeUtils";
import type { BuilderNode } from "../../../lib/types/nodes";

const roots = [
  {
    id: "existing-section",
    type: "section",
    props: {},
    styles: {},
    children: [
      {
        id: "existing-container",
        type: "container",
        props: {},
        styles: {},
        children: [],
      },
    ],
  },
] as BuilderNode[];

describe("agent canvas insertion position", () => {
  it("appends new page sections when no position is supplied", () => {
    expect(
      resolveInsertPosition(roots, null, undefined, (nodes, id) =>
        findNodeById(nodes, id) ?? null,
      ),
    ).toBe(1);
  });

  it("appends children to the requested parent", () => {
    expect(
      resolveInsertPosition(
        roots,
        "existing-section",
        undefined,
        (nodes, id) => findNodeById(nodes, id) ?? null,
      ),
    ).toBe(1);
  });
});
