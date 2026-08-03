import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActionHandler } from "../helpers/actionHandler";

const { getAdapterMock, getResourceMock, saveResourceMock } = vi.hoisted(
  () => ({
    getAdapterMock: vi.fn(),
    getResourceMock: vi.fn(),
    saveResourceMock: vi.fn(),
  }),
);

vi.mock("../../actions/_shared", () => ({
  getAdapter: getAdapterMock,
  getResource: getResourceMock,
  resolveAuthorizedMutation: vi.fn(async () => ({ authorship: {} })),
  saveResource: saveResourceMock,
}));

vi.mock("../../actions/styles", () => ({
  ensureNavigationPresetClassesForAdapter: vi.fn(),
}));

const validNode = {
  id: "existing-node",
  type: "container",
  props: {},
  styles: {},
  children: [],
};

describe("node action render contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdapterMock.mockResolvedValue({});
    getResourceMock.mockResolvedValue({
      id: "home",
      title: "Home",
      slug: "home",
      nodes: [validNode],
    });
  });

  it("rejects structurally invalid single-node inserts after preflight", async () => {
    const { nodes } = await import("../../actions/nodes");

    await expect(
      getActionHandler(nodes.insertNode)(
        {
          collection: "pages",
          id: "home",
          parentId: null,
          node: { id: "invalid-node", type: 42 },
        },
        { locals: {} } as never,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "RENDER_INPUT_INVALID: The render input is invalid.",
    });
    expect(saveResourceMock).not.toHaveBeenCalled();
  });

  it("rejects structurally invalid multi-node inserts after preflight", async () => {
    const { nodes } = await import("../../actions/nodes");

    await expect(
      getActionHandler(nodes.insertNodes)(
        {
          collection: "pages",
          id: "home",
          parentId: null,
          nodes: [{ id: "invalid-node", type: 42 }],
        },
        { locals: {} } as never,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "RENDER_INPUT_INVALID: The render input is invalid.",
    });
    expect(saveResourceMock).not.toHaveBeenCalled();
  });

  it("transports replacement ID mismatches as safe render errors", async () => {
    const { nodes } = await import("../../actions/nodes");

    await expect(
      getActionHandler(nodes.replaceNode)(
        {
          collection: "pages",
          id: "home",
          nodeId: validNode.id,
          node: { ...validNode, id: "different-node" },
        },
        { locals: {} } as never,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "RENDER_INPUT_INVALID: The render input is invalid.",
    });
    expect(saveResourceMock).not.toHaveBeenCalled();
  });
});
