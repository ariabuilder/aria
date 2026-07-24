import { generateNodeId } from "../ids/nodeId";
import type { BuilderNode } from "../types/nodes";
import { NAVIGATION_PRESET_CLASS_NAMES } from "./navigationPresetClasses";
import { DEFAULT_NAVIGATION_PROPS } from "./navigationSchema";

function createNavLinkItem(label: string, href: string): BuilderNode {
  return {
    id: generateNodeId(),
    type: "nav-item",
    props: {
      submenuType: "none",
      visibility: "all",
    },
    styles: {},
    classNames: { base: [] },
    customClasses: [NAVIGATION_PRESET_CLASS_NAMES.item],
    children: [
      {
        id: generateNodeId(),
        type: "link",
        props: {
          href,
          text: label,
        },
        styles: {},
        classNames: { base: [] },
        customClasses: [NAVIGATION_PRESET_CLASS_NAMES.link],
        children: [],
      },
    ],
  };
}

function createNavItemsNode(items: BuilderNode[]): BuilderNode {
  return {
    id: generateNodeId(),
    type: "nav-items",
    props: {},
    styles: {},
    classNames: { base: [] },
    customClasses: [NAVIGATION_PRESET_CLASS_NAMES.items],
    children: items,
  };
}

function createNavToggleNode(options?: {
  id?: string;
  iconId?: string;
  classNames?: string[];
}): BuilderNode {
  return {
    id: options?.id ?? generateNodeId(),
    type: "nav-toggle",
    props: {
      variant: "open",
      ariaLabel: "Open menu",
    },
    styles: {},
    classNames: { base: options?.classNames ?? [] },
    customClasses: [NAVIGATION_PRESET_CLASS_NAMES.toggle],
    children: [
      {
        id: options?.iconId ?? generateNodeId(),
        type: "icon",
        props: {
          icon: "i-hugeicons:menu-01",
        },
        styles: {},
        classNames: { base: [] },
        customClasses: [NAVIGATION_PRESET_CLASS_NAMES.icon],
        children: [],
      },
    ],
  };
}

type CmsFieldLoopNavigationOptions = {
  navigationId: string;
  navItemsId: string;
  navItemTemplateId: string;
  navItemLinkId: string;
  navToggleId: string;
  navToggleIconId: string;
  entrySlug: string;
  classNames?: Partial<{
    navigation: string[];
    navItem: string[];
    link: string[];
    navToggle: string[];
  }>;
};

export function createCmsFieldLoopNavigationNode(
  options: CmsFieldLoopNavigationOptions,
): BuilderNode {
  return {
    id: options.navigationId,
    type: "navigation",
    props: {
      ...DEFAULT_NAVIGATION_PROPS,
      sourceMode: "cms",
      loopMode: "field",
      fieldPath: "items",
    },
    styles: {},
    classNames: { base: options.classNames?.navigation ?? [] },
    dataSource: {
      type: "collection",
      collection: "main-nav",
      mode: "single",
      filter: { slug: options.entrySlug },
    },
    children: [
      {
        id: options.navItemsId,
        type: "nav-items",
        props: {},
        styles: {},
        classNames: { base: [] },
        dataSource: {
          type: "static",
          source: "field",
          mode: "list",
          field: "items",
          entryScope: "context",
        },
        children: [
          {
            id: options.navItemTemplateId,
            type: "nav-item",
            props: {
              submenuType: "none",
              visibility: "all",
            },
            styles: {},
            classNames: { base: options.classNames?.navItem ?? [] },
            children: [
              {
                id: options.navItemLinkId,
                type: "link",
                props: {
                  text: "Menu item",
                  href: "#",
                },
                styles: {},
                classNames: { base: options.classNames?.link ?? [] },
                children: [],
                dataSource: {
                  type: "static",
                  bindings: {
                    text: "label",
                    href: "link",
                  },
                },
              },
            ],
          },
        ],
      },
      createNavToggleNode({
        id: options.navToggleId,
        iconId: options.navToggleIconId,
        classNames: options.classNames?.navToggle,
      }),
    ],
  };
}

export function createNavigationNode(): BuilderNode {
  return {
    id: generateNodeId(),
    type: "navigation",
    props: { ...DEFAULT_NAVIGATION_PROPS, sourceMode: "static" },
    styles: {},
    classNames: { base: [] },
    customClasses: [NAVIGATION_PRESET_CLASS_NAMES.bar],
    children: [
      createNavItemsNode([
        createNavLinkItem("Home", "/"),
        createNavLinkItem("About", "/about"),
        createNavLinkItem("Contact", "/contact"),
      ]),
      createNavToggleNode(),
    ],
  };
}
