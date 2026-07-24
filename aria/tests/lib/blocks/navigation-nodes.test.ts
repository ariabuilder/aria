import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAVIGATION_PROPS,
  NavigationPropsSchema,
  parseNavigationProps,
} from "../../../lib/blocks/navigationSchema";
import {
  createCmsFieldLoopNavigationNode,
  createNavigationNode,
} from "../../../lib/blocks/navigationNodes";
import {
  NAVIGATION_PRESET_CLASS_NAMES,
  createNavigationPresetClasses,
} from "../../../lib/blocks/navigationPresetClasses";

describe("navigationSchema", () => {
  it("parses defaults", () => {
    expect(parseNavigationProps({})).toEqual(DEFAULT_NAVIGATION_PROPS);
    expect(DEFAULT_NAVIGATION_PROPS.sourceMode).toBe("static");
  });

  it("validates navigation props", () => {
    const parsed = NavigationPropsSchema.parse({
      ariaLabel: "Footer",
      sourceMode: "static",
      mobileEnabled: false,
    });
    expect(parsed.ariaLabel).toBe("Footer");
    expect(parsed.sourceMode).toBe("static");
    expect(parsed.mobileEnabled).toBe(false);
  });
});

describe("createNavigationNode", () => {
  it("creates a styled static navigation scaffold", () => {
    const node = createNavigationNode();
    expect(node.type).toBe("navigation");
    expect(node.props).toMatchObject({
      ariaLabel: "Main navigation",
      sourceMode: "static",
    });
    expect(node.dataSource).toBeUndefined();
    expect(node.classNames?.base).toEqual([]);
    expect(node.customClasses).toContain(NAVIGATION_PRESET_CLASS_NAMES.bar);

    const navItems = node.children.find((child) => child.type === "nav-items");
    expect(navItems?.customClasses).toContain(
      NAVIGATION_PRESET_CLASS_NAMES.items,
    );
    const navItem = navItems?.children[0];
    expect(navItem?.customClasses).toContain(NAVIGATION_PRESET_CLASS_NAMES.item);
    const link = navItem?.children[0];
    expect(link?.customClasses).toContain(NAVIGATION_PRESET_CLASS_NAMES.link);

    const toggle = node.children.find((child) => child.type === "nav-toggle");
    expect(toggle?.customClasses).toContain(NAVIGATION_PRESET_CLASS_NAMES.toggle);
    expect(toggle?.children[0]?.customClasses).toContain(
      NAVIGATION_PRESET_CLASS_NAMES.icon,
    );
    expect(node.children.some((child) => child.type === "nav-items")).toBe(true);
    expect(node.children.some((child) => child.type === "nav-toggle")).toBe(
      true,
    );
  });
});

describe("createNavigationPresetClasses", () => {
  it("creates semantic classes for the drop-in navigation preset", () => {
    const classes = createNavigationPresetClasses("2026-07-05T00:00:00.000Z");

    expect(Object.keys(classes)).toEqual(
      expect.arrayContaining(Object.values(NAVIGATION_PRESET_CLASS_NAMES)),
    );
    expect(classes["site-nav-bar"]?.variants[0]?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "width", value: "100%" }),
        expect.objectContaining({ property: "display", value: "flex" }),
      ]),
    );
    expect(classes["site-nav-link"]?.pseudoVariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "hover" }),
        expect.objectContaining({ state: "focus-visible" }),
      ]),
    );
  });
});

describe("createCmsFieldLoopNavigationNode", () => {
  it("binds an explicit main-nav entry repeater field loop", () => {
    const node = createCmsFieldLoopNavigationNode({
      navigationId: "header-navigation",
      navItemsId: "header-nav-items",
      navItemTemplateId: "header-nav-item-template",
      navItemLinkId: "header-nav-item-link",
      navToggleId: "header-nav-toggle",
      navToggleIconId: "header-nav-toggle-icon",
      entrySlug: "header",
    });
    expect(node.id).toBe("header-navigation");
    expect(node.dataSource).toMatchObject({
      collection: "main-nav",
      mode: "single",
      filter: { slug: "header" },
    });
    const navItems = node.children.find((child) => child.type === "nav-items");
    expect(navItems?.dataSource).toMatchObject({
      source: "field",
      field: "items",
    });
    const template = navItems?.children[0];
    const link = template?.children[0];
    expect(link?.dataSource?.bindings).toEqual({
      text: "label",
      href: "link",
    });
  });
});
