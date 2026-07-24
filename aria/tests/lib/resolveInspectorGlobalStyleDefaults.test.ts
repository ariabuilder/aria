import { describe, expect, it } from "vitest";

import { createDefaultGlobalStylesConfig } from "../../lib/styles/universalDesignSystem";
import { DEFAULT_TYPOGRAPHY } from "@/features/Design/composables/useTypography";
import {
  resolveInspectorGlobalStyleDefaults,
  resolveStyleTargetContext,
} from "@/features/Inspector/lib/resolveInspectorGlobalStyleDefaults";
import type { BuilderNode } from "../../lib/types/nodes";

function createHeadingNode(level: number, element?: string): BuilderNode {
  return {
    id: "heading-1",
    type: "heading",
    props: {
      level,
      text: "Title",
      ...(element ? { element } : {}),
    },
    styles: {},
    children: [],
  };
}

function createButtonNode(options: {
  variant?: string;
  disabled?: boolean;
}): BuilderNode {
  return {
    id: "button-1",
    type: "button",
    props: {
      label: "Click",
      variant: options.variant ?? "primary",
      ...(options.disabled ? { disabled: true } : {}),
    },
    styles: {},
    children: [],
  };
}

describe("resolveInspectorGlobalStyleDefaults", () => {
  const globalStyles = createDefaultGlobalStylesConfig();
  globalStyles.defaults.heading.color = "#112233";
  globalStyles.defaults.heading.fontWeight = "700";
  globalStyles.defaults.subheading.color = "#445566";
  globalStyles.defaults.body.color = "#0f172a";
  globalStyles.defaults.paragraph.fontSize = "18px";
  globalStyles.defaults.button.variants.primary.backgroundColor = "#111111";
  globalStyles.defaults.button.variants.primary.color = "#ffffff";
  globalStyles.defaults.button.variants.disabled.backgroundColor = "#333333";
  globalStyles.defaults.button.base.fontSize = "14px";
  globalStyles.defaults.button.base.paddingX = "16px";
  globalStyles.defaults.button.base.paddingY = "10px";
  globalStyles.defaults.section.verticalPadding = "48px";
  globalStyles.defaults.section.horizontalPadding = "24px";
  globalStyles.defaults.section.sectionGap = "32px";
  globalStyles.defaults.input.backgroundColor = "#222222";
  globalStyles.defaults.input.color = "#eeeeee";
  globalStyles.defaults.link.color = "inherit";
  globalStyles.defaults.link.hoverColor = "#000000";

  const typography = structuredClone(DEFAULT_TYPOGRAPHY);

  const baseInput = {
    globalStyles,
    typography,
    pseudo: "default" as const,
    tokenPreviewOptions: [],
  };

  it("resolves heading h1 typography from global styles and scale", () => {
    const node = createHeadingNode(1);
    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.color).toBe("#112233");
    expect(defaults.fontWeight).toBe("700");
    expect(defaults.fontSize).toMatch(/px$/);
  });

  it("uses heading defaults for h5", () => {
    const node = createHeadingNode(5);
    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.color).toBe("#112233");
  });

  it("keeps heading defaults when heading tag is overridden to div", () => {
    const node = createHeadingNode(2, "div");
    const context = resolveStyleTargetContext(node);

    expect(context.bucket).toBe("heading");

    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });
    expect(defaults.color).toBe("#112233");
  });

  it("resolves button variant colors and padding", () => {
    const node = createButtonNode({ variant: "primary" });
    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.backgroundColor).toBe("#111111");
    expect(defaults.color).toBe("#ffffff");
    expect(defaults.paddingLeft).toBe("16px");
    expect(defaults.paddingTop).toBe("10px");
  });

  it("uses disabled variant when button is disabled", () => {
    const node = createButtonNode({ disabled: true });
    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.backgroundColor).toBe("#333333");
  });

  it("resolves link inherit color to body color", () => {
    const node: BuilderNode = {
      id: "link-1",
      type: "link",
      props: { href: "#", text: "Link" },
      styles: {},
      children: [],
    };

    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });
    expect(defaults.color).toBe("#0f172a");
  });

  it("resolves link hover color for hover pseudo", () => {
    const node: BuilderNode = {
      id: "link-1",
      type: "link",
      props: { href: "#", text: "Link" },
      styles: {},
      children: [],
    };

    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
      pseudo: "hover",
    });

    expect(defaults.color).toBe("#000000");
  });

  it("resolves section padding and gap without maxWidth", () => {
    const node: BuilderNode = {
      id: "section-1",
      type: "section",
      props: {},
      styles: {},
      children: [],
    };

    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.paddingTop).toBe("48px");
    expect(defaults.paddingLeft).toBe("24px");
    expect(defaults.gap).toBe("32px");
    expect(defaults.maxWidth).toBeUndefined();
  });

  it("resolves input defaults", () => {
    const node: BuilderNode = {
      id: "input-1",
      type: "input",
      props: { type: "text" },
      styles: {},
      children: [],
    };

    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.backgroundColor).toBe("#222222");
    expect(defaults.color).toBe("#eeeeee");
    expect(defaults.borderStyle).toBe("solid");
  });

  it("resolves paragraph maxWidth from body defaults", () => {
    (globalStyles.defaults.body as { maxWidth?: string }).maxWidth = "40rem";

    const node: BuilderNode = {
      id: "paragraph-1",
      type: "paragraph",
      props: { content: "Copy" },
      styles: {},
      children: [],
    };

    const defaults = resolveInspectorGlobalStyleDefaults({
      ...baseInput,
      node,
    });

    expect(defaults.maxWidth).toBe("40rem");
    expect(defaults.fontSize).toBe("16px");
  });
});
