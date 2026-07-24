import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGE_OVERLAY_ROOT_ATTR } from "../../../admin/features/Stage/composables/useIframeSetup";
import {
  INTERACTION_OVERLAY_ATTR,
  collectNodeCandidatesAtPoint,
  createFrameViewportPoint,
  resolveSelectionAtPoint,
  resolveHoverFromEventTarget,
  resolveSelectionFromEventTarget,
} from "../../../admin/features/Stage/interaction";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function createStageRoot(): HTMLElement {
  const root = document.createElement("main");
  root.setAttribute("data-aria-stage-content-root", "");
  document.body.appendChild(root);
  return root;
}

describe("selection resolver", () => {
  it("resolves hover to the nearest aria node", () => {
    const root = createStageRoot();
    const container = document.createElement("section");
    container.setAttribute("data-aria-id", "container-1");
    container.setAttribute("data-aria-type", "Container");

    const paragraph = document.createElement("p");
    paragraph.setAttribute("data-aria-id", "text-1");
    paragraph.setAttribute("data-aria-type", "Paragraph");

    container.appendChild(paragraph);
    root.appendChild(container);

    expect(resolveHoverFromEventTarget(paragraph)?.nodeId).toBe("text-1");
  });

  it("locks component descendants to their component wrapper", () => {
    const root = createStageRoot();
    const component = document.createElement("div");
    component.setAttribute("data-aria-id", "component-1");
    component.setAttribute("data-aria-type", "Component");
    component.setAttribute("data-component-ref", "hero-card");

    const heading = document.createElement("h2");
    heading.setAttribute("data-aria-id", "heading-1");
    heading.setAttribute("data-aria-type", "Heading");

    component.appendChild(heading);
    root.appendChild(component);

    const selection = resolveSelectionFromEventTarget(heading);

    expect(selection?.nodeId).toBe("component-1");
    expect(selection?.nodeType).toBe("Component");
  });

  it("uses semantic priority when clicking text content", () => {
    const root = createStageRoot();
    const container = document.createElement("section");
    container.setAttribute("data-aria-id", "container-1");
    container.setAttribute("data-aria-type", "Container");
    container.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 800, height: 400 } as DOMRect);

    const heading = document.createElement("h2");
    heading.setAttribute("data-aria-id", "heading-1");
    heading.setAttribute("data-aria-type", "Heading");
    heading.textContent = "Title";
    heading.getBoundingClientRect = () =>
      ({ top: 20, left: 20, width: 200, height: 40 } as DOMRect);

    container.appendChild(heading);
    root.appendChild(container);

    const selection = resolveSelectionFromEventTarget(heading, {
      isTextContent: () => true,
      semanticPriority: {
        Container: 1,
        Heading: 5,
      },
    });

    expect(selection?.nodeId).toBe("heading-1");
  });

  it("selects the deepest painted node when the raw event target is an outer container", () => {
    const root = createStageRoot();
    const container = document.createElement("section");
    container.setAttribute("data-aria-id", "container-1");
    container.setAttribute("data-aria-type", "Container");

    const heading = document.createElement("h2");
    heading.setAttribute("data-aria-id", "heading-1");
    heading.setAttribute("data-aria-type", "Heading");
    heading.textContent = "Title";

    container.appendChild(heading);
    root.appendChild(container);

    Object.defineProperty(document, "elementFromPoint", {
      value: vi.fn(() => container),
      configurable: true,
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [heading, container, root]),
      configurable: true,
    });

    const selection = resolveSelectionAtPoint(
      document,
      createFrameViewportPoint(20, 20),
      {
        isTextContent: (element) => element === heading,
        semanticPriority: {
          Container: 1,
          Heading: 5,
        },
      },
    );

    expect(selection?.nodeId).toBe("heading-1");
    expect(selection?.candidates.map((candidate) => candidate.nodeId)).toEqual([
      "heading-1",
      "container-1",
    ]);
  });

  it("resolves candidates from iframe-realm elements", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error("Expected iframe document");
    }

    iframeDoc.body.innerHTML = `
      <main data-aria-stage-content-root>
        <p data-aria-id="paragraph-1" data-aria-type="Paragraph">Iframe paragraph</p>
      </main>
    `;

    const paragraph = iframeDoc.querySelector(
      '[data-aria-id="paragraph-1"]',
    ) as HTMLElement | null;
    expect(paragraph).not.toBeNull();

    paragraph!.getBoundingClientRect = () =>
      ({ top: 20, left: 20, width: 200, height: 40 } as DOMRect);

    Object.defineProperty(iframeDoc, "elementFromPoint", {
      value: vi.fn(() => paragraph),
      configurable: true,
    });
    Object.defineProperty(iframeDoc, "elementsFromPoint", {
      value: vi.fn(() => [paragraph!, iframeDoc.body]),
      configurable: true,
    });

    const selection = resolveSelectionAtPoint(
      iframeDoc,
      createFrameViewportPoint(24, 24),
    );

    expect(selection?.nodeId).toBe("paragraph-1");

    iframe.remove();
  });

  it("selects the editable heading id when clicking a nested link inside a CMS clone", () => {
    const root = createStageRoot();
    const container = document.createElement("section");
    container.setAttribute("data-aria-id", "card-node__cms_0_entry-1");
    container.setAttribute("data-aria-template-id", "card-node");
    container.setAttribute("data-aria-type", "Container");

    const heading = document.createElement("h2");
    heading.setAttribute("data-aria-id", "heading-node__cms_0_entry-1");
    heading.setAttribute("data-aria-template-id", "heading-node");
    heading.setAttribute("data-aria-type", "Heading");

    const link = document.createElement("a");
    link.href = "/posts/entry-1";
    link.textContent = "CMS title";

    heading.appendChild(link);
    container.appendChild(heading);
    root.appendChild(container);

    const selection = resolveSelectionFromEventTarget(link, {
      isTextContent: (element) => element.tagName === "A",
      semanticPriority: {
        Container: 1,
        Heading: 5,
      },
    });

    expect(selection?.nodeId).toBe("heading-node");
    expect(selection?.element).toBe(heading);
    expect(selection?.candidates.map((candidate) => candidate.nodeId)).toEqual([
      "heading-node",
      "card-node",
    ]);
  });

  it("ignores iframe overlay elements during point hit testing", () => {
    const root = createStageRoot();
    const section = document.createElement("section");
    section.setAttribute("data-aria-id", "section-1");
    section.setAttribute("data-aria-type", "Section");
    root.appendChild(section);

    const overlayRoot = document.createElement("div");
    overlayRoot.setAttribute(STAGE_OVERLAY_ROOT_ATTR, "true");
    const overlay = document.createElement("div");
    overlay.setAttribute(INTERACTION_OVERLAY_ATTR, "true");
    overlayRoot.appendChild(overlay);
    document.body.appendChild(overlayRoot);

    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [overlay, section, root]),
      configurable: true,
    });

    const candidates = collectNodeCandidatesAtPoint(
      document,
      createFrameViewportPoint(20, 40),
    );

    expect(candidates.map((candidate) => candidate.nodeId)).toEqual([
      "section-1",
    ]);
  });

  it("returns null for background selection", () => {
    const root = createStageRoot();

    expect(resolveSelectionFromEventTarget(root)).toBeNull();
  });
});
