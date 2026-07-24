import { describe, expect, it } from "vitest";
import type { BuilderNode } from "../../../lib/types/nodes";
import {
  applyNavActiveStateOnNodes,
  hrefMatchesNavPathname,
  normalizeNavPathname,
  prepareNavigationForRender,
} from "../../../lib/cms/navActive";
import { markNavigationMegaSlots } from "../../../lib/nav/navRenderAttributes";

function createNavTree(): BuilderNode[] {
  return [
    {
      id: "nav-root",
      type: "navigation",
      props: { activeMatch: "prefix" },
      styles: {},
      classNames: { base: [] },
      children: [
        {
          id: "nav-items",
          type: "nav-items",
          props: {},
          styles: {},
          classNames: { base: [] },
          children: [
            {
              id: "nav-item-home",
              type: "nav-item",
              props: {},
              styles: {},
              classNames: { base: [] },
              children: [
                {
                  id: "nav-link-home",
                  type: "link",
                  props: { href: "/", text: "Home" },
                  styles: {},
                  classNames: { base: [] },
                  children: [],
                },
              ],
            },
            {
              id: "nav-item-blog",
              type: "nav-item",
              props: {},
              styles: {},
              classNames: { base: [] },
              children: [
                {
                  id: "nav-link-blog",
                  type: "link",
                  props: { href: "/blog", text: "Blog" },
                  styles: {},
                  classNames: { base: [] },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

describe("navActive", () => {
  it("normalizes pathnames", () => {
    expect(normalizeNavPathname("/blog/")).toBe("/blog");
    expect(normalizeNavPathname("blog")).toBe("/blog");
    expect(normalizeNavPathname("/")).toBe("/");
  });

  it("matches exact and prefix modes", () => {
    expect(hrefMatchesNavPathname("/blog", "/blog/post", "prefix")).toBe(true);
    expect(hrefMatchesNavPathname("/blog", "/blog/post", "exact")).toBe(false);
    expect(hrefMatchesNavPathname("/", "/about", "prefix")).toBe(false);
  });

  it("marks active links and items for the current path", () => {
    const nodes = createNavTree();
    applyNavActiveStateOnNodes(nodes, "/blog/hello");

    const blogLink = nodes[0].children[0].children[1].children[0];
    expect(blogLink.props.__navCurrent).toBe(true);
    expect(blogLink.classNames?.base).toContain("aria-nav-active");
    expect(nodes[0].children[0].children[1].classNames?.base).toContain(
      "aria-nav-active",
    );
  });

  it("marks active links across multiple direct nav item groups", () => {
    const nodes = createNavTree();
    const navRoot = nodes[0];
    navRoot.children.push({
      id: "cms-nav-items",
      type: "nav-items",
      props: {},
      styles: {},
      classNames: { base: [] },
      children: [
        {
          id: "nav-item-services",
          type: "nav-item",
          props: {},
          styles: {},
          classNames: { base: [] },
          children: [
            {
              id: "nav-link-services",
              type: "link",
              props: { href: "/services", text: "Services" },
              styles: {},
              classNames: { base: [] },
              children: [],
            },
          ],
        },
      ],
    });

    applyNavActiveStateOnNodes(nodes, "/services/design");

    const servicesItem = navRoot.children[1].children[0];
    const servicesLink = servicesItem.children[0];
    expect(servicesLink.props.__navCurrent).toBe(true);
    expect(servicesLink.classNames?.base).toContain("aria-nav-active");
    expect(servicesItem.classNames?.base).toContain("aria-nav-active");
  });

  it("marks mega menu slot containers", () => {
    const nodes: BuilderNode[] = [
      {
        id: "nav-item-mega",
        type: "nav-item",
        props: { submenuType: "mega" },
        styles: {},
        classNames: { base: [] },
        children: [
          {
            id: "mega-slot",
            type: "container",
            props: {},
            styles: {},
            classNames: { base: [] },
            children: [],
          },
        ],
      },
    ];

    markNavigationMegaSlots(nodes);
    prepareNavigationForRender(nodes, "/");

    expect(nodes[0].children[0].metadata?.ariaNavMegaSlot).toBe(true);
  });
});
