import { describe, expect, it } from "vitest";
import type { AgentShellContext } from "../../../admin/features/Agent/lib/schemas";
import {
  anchorClientToolInputToRunSelection,
  isAgentRunDocumentCurrent,
  resolveAgentRunDocumentIdentity,
} from "../../../admin/features/Agent/lib/agentRunContext";

function context(overrides: Partial<AgentShellContext> = {}): AgentShellContext {
  return {
    mode: "composer",
    workspace: "composer",
    itemType: "page",
    itemSlug: "blog",
    itemTitle: "Blog",
    pageId: "page-blog",
    selectedBlockId: "heading-1",
    blockCount: 3,
    canClientInsert: true,
    canClientNavigate: true,
    ...overrides,
  };
}

describe("agent run context", () => {
  it("does not treat selection and Inspector changes as a document switch", () => {
    const expected = resolveAgentRunDocumentIdentity(context());
    expect(
      isAgentRunDocumentCurrent(
        expected,
        context({ selectedBlockId: "image-2", blockCount: 4 }),
      ),
    ).toBe(true);
  });

  it("blocks a canvas write after the user opens another document", () => {
    const expected = resolveAgentRunDocumentIdentity(context());
    expect(
      isAgentRunDocumentCurrent(
        expected,
        context({ itemSlug: "about", itemTitle: "About" }),
      ),
    ).toBe(false);
  });

  it("anchors an implicit motion target to the request-time selection", () => {
    expect(
      anchorClientToolInputToRunSelection(
        "update_node_motion",
        { motion: { enabled: true, preset: "fade-up" } },
        "heading-1",
      ),
    ).toEqual({
      blockId: "heading-1",
      motion: { enabled: true, preset: "fade-up" },
    });
  });

  it("preserves an explicit target supplied by the model", () => {
    expect(
      anchorClientToolInputToRunSelection(
        "update_node_motion",
        { blockId: "hero", motion: { enabled: true } },
        "heading-1",
      ),
    ).toEqual({ blockId: "hero", motion: { enabled: true } });
  });
});
