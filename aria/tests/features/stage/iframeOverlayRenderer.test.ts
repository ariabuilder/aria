import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGE_OVERLAY_ROOT_ATTR } from "../../../admin/features/Stage/composables/useIframeSetup";
import {
  INTERACTION_OVERLAY_ATTR,
  INTERACTION_OVERLAY_ID_ATTR,
  createFrameViewportRect,
  createIframeOverlayRenderer,
  type VisualOverlayDescriptor,
} from "../../../admin/features/Stage/interaction";

function createFrameFixture(): {
  iframe: HTMLIFrameElement;
  root: HTMLElement;
} {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    throw new Error("Expected iframe contentDocument");
  }

  doc.body.innerHTML = `<main data-aria-stage-content-root></main><div ${STAGE_OVERLAY_ROOT_ATTR} aria-hidden="true"></div>`;
  const root = doc.querySelector<HTMLElement>(`[${STAGE_OVERLAY_ROOT_ATTR}]`);
  if (!root) {
    throw new Error("Expected overlay root");
  }

  Object.defineProperty(iframe.contentWindow, "scrollX", {
    value: 13,
    configurable: true,
  });
  Object.defineProperty(iframe.contentWindow, "scrollY", {
    value: 17,
    configurable: true,
  });

  return { iframe, root };
}

function selectionDescriptor(id = "selection"): VisualOverlayDescriptor {
  return {
    kind: "selection",
    id,
    nodeId: "node-1",
    rect: createFrameViewportRect({
      left: 20,
      top: 100,
      width: 360,
      height: 40,
    }),
    variant: "primary",
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("iframe overlay renderer", () => {
  it("renders visual descriptors into the iframe overlay root", () => {
    const { iframe, root } = createFrameFixture();
    const renderer = createIframeOverlayRenderer({
      iframe,
      resolvePrimaryColor: () => "rgb(0, 128, 128)",
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });

    renderer.render([selectionDescriptor()]);
    renderer.flush();

    const overlay = root.querySelector<HTMLElement>(
      `[${INTERACTION_OVERLAY_ATTR}="true"]`,
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute(INTERACTION_OVERLAY_ID_ATTR)).toBe(
      "selection",
    );
  });

  it("projects frame viewport rects to iframe document coordinates", () => {
    const { iframe, root } = createFrameFixture();
    const renderer = createIframeOverlayRenderer({
      iframe,
      resolvePrimaryColor: () => "rgb(0, 128, 128)",
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });

    renderer.render([selectionDescriptor()]);
    renderer.flush();

    const overlay = root.querySelector<HTMLElement>(
      `[${INTERACTION_OVERLAY_ATTR}="true"]`,
    );
    expect(overlay?.style.transform).toBe("translate3d(33px, 117px, 0)");
    expect(overlay?.style.width).toBe("360px");
    expect(overlay?.style.height).toBe("40px");
  });

  it("diffs descriptors by stable id and removes stale overlays", () => {
    const { iframe, root } = createFrameFixture();
    const renderer = createIframeOverlayRenderer({
      iframe,
      resolvePrimaryColor: () => "rgb(0, 128, 128)",
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });

    renderer.render([selectionDescriptor("primary"), selectionDescriptor("secondary")]);
    renderer.flush();
    expect(root.querySelectorAll(`[${INTERACTION_OVERLAY_ATTR}]`)).toHaveLength(2);

    renderer.render([selectionDescriptor("primary")]);
    renderer.flush();

    expect(root.querySelectorAll(`[${INTERACTION_OVERLAY_ATTR}]`)).toHaveLength(1);
    expect(
      root.querySelector(`[${INTERACTION_OVERLAY_ID_ATTR}="primary"]`),
    ).not.toBeNull();
    expect(
      root.querySelector(`[${INTERACTION_OVERLAY_ID_ATTR}="secondary"]`),
    ).toBeNull();
  });

  it("keeps overlay root and children out of pointer hit testing", () => {
    const { iframe, root } = createFrameFixture();
    const renderer = createIframeOverlayRenderer({
      iframe,
      resolvePrimaryColor: () => "rgb(0, 128, 128)",
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });

    renderer.render([selectionDescriptor()]);
    renderer.flush();

    const overlay = root.querySelector<HTMLElement>(
      `[${INTERACTION_OVERLAY_ATTR}="true"]`,
    );
    expect(root.style.pointerEvents).toBe("none");
    expect(overlay?.style.pointerEvents).toBe("none");
  });

  it("clears all renderer-owned overlays", () => {
    const { iframe, root } = createFrameFixture();
    const renderer = createIframeOverlayRenderer({
      iframe,
      resolvePrimaryColor: () => "rgb(0, 128, 128)",
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });

    renderer.render([selectionDescriptor()]);
    renderer.flush();
    renderer.clear();

    expect(root.querySelectorAll(`[${INTERACTION_OVERLAY_ATTR}]`)).toHaveLength(0);
  });
});
