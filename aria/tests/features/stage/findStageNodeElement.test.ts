import { afterEach, describe, expect, it } from "vitest";

import {
  elementMatchesStageNodeId,
  findStageNodeElement,
  readStageEditableNodeId,
} from "../../../admin/features/Stage/utils/findStageNodeElement";
import type { BuilderNode } from "../../../lib/types/nodes";

describe("findStageNodeElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers the non-component DOM match for plain page nodes when IDs collide", () => {
    const blocks: BuilderNode[] = [
      {
        id: "shared-node",
        type: "Section",
        props: {},
        styles: {},
        children: [],
      },
      {
        id: "footer-instance",
        type: "Component",
        props: { componentId: "footer" },
        styles: {},
        reference: { type: "instance", masterId: "footer" },
        children: [
          {
            id: "shared-node",
            type: "Section",
            props: {},
            styles: {},
            children: [],
          },
        ],
      },
    ];

    const pageSection = document.createElement("section");
    pageSection.setAttribute("data-aria-id", "shared-node");
    document.body.appendChild(pageSection);

    const componentWrapper = document.createElement("div");
    componentWrapper.setAttribute("data-aria-id", "footer-instance");
    componentWrapper.setAttribute("data-component-ref", "footer");
    const componentSection = document.createElement("section");
    componentSection.setAttribute("data-aria-id", "shared-node");
    componentWrapper.appendChild(componentSection);
    document.body.appendChild(componentWrapper);

    expect(findStageNodeElement(document, blocks, "shared-node")).toBe(
      pageSection,
    );
  });

  it("prefers the DOM match inside the owning component wrapper for component descendants", () => {
    const blocks: BuilderNode[] = [
      {
        id: "page-section",
        type: "Section",
        props: {},
        styles: {},
        children: [
          {
            id: "shared-button",
            type: "Button",
            props: {},
            styles: {},
            children: [],
          },
        ],
      },
      {
        id: "button-variants-instance",
        type: "Component",
        props: { componentId: "button-variants" },
        styles: {},
        reference: { type: "instance", masterId: "button-variants" },
        children: [
          {
            id: "shared-button",
            type: "Button",
            props: {},
            styles: {},
            children: [],
          },
        ],
      },
    ];

    const pageButton = document.createElement("button");
    pageButton.setAttribute("data-aria-id", "shared-button");
    document.body.appendChild(pageButton);

    const componentWrapper = document.createElement("div");
    componentWrapper.setAttribute("data-aria-id", "button-variants-instance");
    componentWrapper.setAttribute("data-component-ref", "button-variants");
    const componentButton = document.createElement("button");
    componentButton.setAttribute("data-aria-id", "shared-button");
    componentWrapper.appendChild(componentButton);
    document.body.appendChild(componentWrapper);

    expect(findStageNodeElement(document, [blocks[1]], "shared-button")).toBe(
      componentButton,
    );
  });

  it("resolves CMS loop clones by their editable template node id", () => {
    const blocks: BuilderNode[] = [
      {
        id: "card-title",
        type: "Heading",
        props: {},
        styles: {},
        children: [],
      },
    ];

    const clonedHeading = document.createElement("h2");
    clonedHeading.setAttribute("data-aria-id", "card-title__cms_0_entry-1");
    clonedHeading.setAttribute("data-aria-template-id", "card-title");
    document.body.appendChild(clonedHeading);

    expect(findStageNodeElement(document, blocks, "card-title")).toBe(
      clonedHeading,
    );
  });

  it("prefers the currently connected clone when template ids repeat", () => {
    const blocks: BuilderNode[] = [
      {
        id: "card-title",
        type: "Heading",
        props: {},
        styles: {},
        children: [],
      },
    ];

    const firstClone = document.createElement("h2");
    firstClone.setAttribute("data-aria-id", "card-title__cms_0_entry-1");
    firstClone.setAttribute("data-aria-template-id", "card-title");
    document.body.appendChild(firstClone);

    const secondClone = document.createElement("h2");
    secondClone.setAttribute("data-aria-id", "card-title__cms_1_entry-2");
    secondClone.setAttribute("data-aria-template-id", "card-title");
    const nestedLink = document.createElement("a");
    nestedLink.href = "/posts/entry-2";
    secondClone.appendChild(nestedLink);
    document.body.appendChild(secondClone);

    expect(
      findStageNodeElement(document, blocks, "card-title", {
        preferredElement: nestedLink,
      }),
    ).toBe(secondClone);
  });

  it("prefers exact runtime id matches before template-id matches", () => {
    const blocks: BuilderNode[] = [
      {
        id: "card-title",
        type: "Heading",
        props: {},
        styles: {},
        children: [],
      },
    ];

    const exactMatch = document.createElement("h2");
    exactMatch.setAttribute("data-aria-id", "card-title");
    document.body.appendChild(exactMatch);

    const cloneMatch = document.createElement("h2");
    cloneMatch.setAttribute("data-aria-id", "card-title__cms_0_entry-1");
    cloneMatch.setAttribute("data-aria-template-id", "card-title");
    document.body.appendChild(cloneMatch);

    expect(findStageNodeElement(document, blocks, "card-title")).toBe(
      exactMatch,
    );
  });

  it("reads editable ids and matches nested targets through their closest stage node", () => {
    const cloneMatch = document.createElement("h2");
    cloneMatch.setAttribute("data-aria-id", "card-title__cms_0_entry-1");
    cloneMatch.setAttribute("data-aria-template-id", "card-title");
    const nestedLink = document.createElement("a");
    cloneMatch.appendChild(nestedLink);
    document.body.appendChild(cloneMatch);

    expect(readStageEditableNodeId(cloneMatch)).toBe("card-title");
    expect(elementMatchesStageNodeId(nestedLink, "card-title")).toBe(true);
    expect(
      elementMatchesStageNodeId(nestedLink, "card-title__cms_0_entry-1"),
    ).toBe(true);
  });
});
