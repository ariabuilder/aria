import { describe, expect, it } from "vitest";

import {
  getContentStyleTargetElement,
  getContentStyleTargetSelector,
  getInlineEditableElement,
  getTypographyStyleTargetSelector,
  isContentStyleProperty,
  isTypographyStyleProperty,
  partitionNodeStyles,
} from "../../../admin/features/Stage/utils/nodeStyleRuntime";

describe("nodeStyleRuntime", () => {
  it("routes icon typography and content styles to the icon host", () => {
    const styles = partitionNodeStyles(
      {
        color: { base: "red" },
        fontSize: { base: "24px" },
        width: { base: "24px" },
        height: { base: "24px" },
      },
      "icon",
    );

    expect(styles.containerStyles.width).toEqual({ base: "24px" });
    expect(styles.containerStyles.height).toEqual({ base: "24px" });
    expect(styles.typographyStyles.color).toEqual({ base: "red" });
    expect(styles.typographyStyles.fontSize).toEqual({ base: "24px" });
    expect(styles.contentStyles.width).toEqual({ base: "24px" });
    expect(styles.contentStyles.height).toEqual({ base: "24px" });
  });

  it("finds icon hosts as both typography and content targets", () => {
    const container = document.createElement("div");
    const iconHost = document.createElement("span");
    iconHost.setAttribute("data-aria-icon-host", "1");
    container.appendChild(iconHost);

    expect(getInlineEditableElement(container, "icon")).toBe(iconHost);
    expect(getContentStyleTargetElement(container, "icon")).toBe(iconHost);
  });

  it("resolves typography targets for semantic text nodes", () => {
    expect(getTypographyStyleTargetSelector("node-1", "heading")).toContain(
      '[data-aria-id="node-1"] > h1',
    );
    expect(getTypographyStyleTargetSelector("node-1", "heading")).toContain(
      '[data-aria-id="node-1"] > span',
    );
    expect(getTypographyStyleTargetSelector("node-1", "paragraph")).toBe(
      '[data-aria-id="node-1"], [data-aria-id="node-1"] > p, [data-aria-id="node-1"] > div, [data-aria-id="node-1"] > span, [data-aria-id="node-1"] > figcaption, [data-aria-id="node-1"] > address, [data-aria-id="node-1"] > figure',
    );
    expect(getTypographyStyleTargetSelector("node-1", "icon")).toBe(
      '[data-aria-id="node-1"] [data-aria-icon-host="1"]',
    );
    expect(getTypographyStyleTargetSelector("node-1", "div")).toBeNull();
    expect(getContentStyleTargetSelector("node-1", "image")).toBe(
      '[data-aria-id="node-1"], [data-aria-id="node-1"] > img',
    );
  });

  it("finds inline editable elements for span-like text tags", () => {
    const textContainer = document.createElement("section");
    const figcaption = document.createElement("figcaption");
    figcaption.textContent = "Caption";
    textContainer.appendChild(figcaption);

    const headingContainer = document.createElement("article");
    const spanHeading = document.createElement("span");
    spanHeading.textContent = "Hero";
    headingContainer.appendChild(spanHeading);

    expect(getInlineEditableElement(textContainer, "text")).toBe(figcaption);
    expect(getInlineEditableElement(headingContainer, "heading")).toBe(
      spanHeading,
    );
  });

  it("identifies typography-specific properties", () => {
    expect(isTypographyStyleProperty("fontSize")).toBe(true);
    expect(isTypographyStyleProperty("width")).toBe(false);
    expect(isContentStyleProperty("width", "image")).toBe(true);
    expect(isContentStyleProperty("objectFit", "image")).toBe(true);
    expect(isContentStyleProperty("objectPosition", "image")).toBe(true);
    expect(isContentStyleProperty("borderRadius", "image")).toBe(true);
    expect(isContentStyleProperty("borderTopLeftRadius", "image")).toBe(true);
    expect(isContentStyleProperty("width", "icon")).toBe(true);
    expect(isContentStyleProperty("width", "div")).toBe(false);
  });

  it("partitions typography styles away from container styles", () => {
    expect(
      partitionNodeStyles(
        {
          fontSize: { base: "2rem" },
          color: { base: "#111111" },
          width: { base: "100%" },
        },
        "heading",
      ),
    ).toEqual({
      containerStyles: {
        width: { base: "100%" },
      },
      contentStyles: {},
      typographyStyles: {
        color: { base: "#111111" },
        fontSize: { base: "2rem" },
      },
    });
  });

  it("duplicates image sizing styles to the nested image content", () => {
    expect(
      partitionNodeStyles(
        {
          width: { base: "400px" },
          height: { base: "240px" },
          objectFit: { base: "contain" },
          objectPosition: { base: "top center" },
          borderRadius: { base: "40px" },
          borderTopLeftRadius: { base: "24px" },
          marginTop: { base: "12px" },
        },
        "image",
      ),
    ).toEqual({
      containerStyles: {
        width: { base: "400px" },
        height: { base: "240px" },
        objectFit: { base: "contain" },
        objectPosition: { base: "top center" },
        borderRadius: { base: "40px" },
        borderTopLeftRadius: { base: "24px" },
        marginTop: { base: "12px" },
      },
      contentStyles: {
        width: { base: "400px" },
        height: { base: "240px" },
        objectFit: { base: "contain" },
        objectPosition: { base: "top center" },
        borderRadius: { base: "40px" },
        borderTopLeftRadius: { base: "24px" },
      },
      typographyStyles: {},
    });
  });
});
