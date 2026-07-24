/**
 * Demonstrates how to use the test data generator to create pages, layouts, and components.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateId,
  generateSlug,
  createNode,
  createTextNode,
  createHeadingNode,
  createButtonNode,
  createImageNode,
  createContainerNode,
  createSimplePage,
  createLandingPage,
  createBlogPostPage,
  createProductPage,
  createDocPage,
  createSimpleLayout,
  createTwoColumnLayout,
  createBlogLayout,
  createSimpleComponent,
  createButtonComponent,
  createCardComponent,
  createHeroComponent,
  createHydratedComponent,
  createPageCollection,
  createLayoutCollection,
  createComponentCollection,
  createTestDataBundle,
} from "./testDataGenerator";
import type { PageDSL, LayoutDSL, ComponentDSL } from "../../lib/types/nodes";

describe("Test Data Generator - Node Creation", () => {
  it("generates unique IDs", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]+$/);
  });

  it("generates URL-friendly slugs", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
    expect(generateSlug("My Test Page")).toBe("my-test-page");
    expect(generateSlug("Test @ Page!")).toBe("test-page");
  });

  it("creates basic nodes", () => {
    const node = createNode();
    expect(node.id).toBeDefined();
    expect(node.type).toBe("Container");
    expect(node.props).toEqual({});
    expect(node.children).toEqual([]);
  });

  it("creates text nodes", () => {
    const node = createTextNode("Hello World");
    expect(node.type).toBe("Text");
    expect(node.props.content).toBe("Hello World");
  });

  it("creates heading nodes", () => {
    const node = createHeadingNode(1, "Main Title");
    expect(node.type).toBe("Heading");
    expect(node.props.level).toBe(1);
    expect(node.props.content).toBe("Main Title");
  });

  it("creates button nodes", () => {
    const node = createButtonNode("Click Me");
    expect(node.type).toBe("Button");
    expect(node.props.label).toBe("Click Me");
  });

  it("creates image nodes", () => {
    const node = createImageNode("/images/test.jpg", "Test Image");
    expect(node.type).toBe("Image");
    expect(node.props.src).toBe("/images/test.jpg");
    expect(node.props.alt).toBe("Test Image");
  });

  it("creates container nodes with children", () => {
    const child1 = createTextNode("Text 1");
    const child2 = createTextNode("Text 2");
    const container = createContainerNode([child1, child2]);
    expect(container.type).toBe("Container");
    expect(container.children).toHaveLength(2);
    expect(container.children[0].props.content).toBe("Text 1");
  });
});

describe("Test Data Generator - Page Creation", () => {
  it("creates simple pages", () => {
    const page = createSimplePage();
    expect(page.id).toBeDefined();
    expect(page.title).toBe("Test Page");
    expect(page.slug).toBe("test-page");
    expect(page.status).toBe("draft");
    expect(page.nodes).toBeDefined();
  });

  it("creates landing pages", () => {
    const page = createLandingPage();
    expect(page.title).toBe("Landing Page");
    expect(page.slug).toBe("landing-page");
    expect(page.nodes[0].type).toBe("Container");
  });

  it("creates blog post pages", () => {
    const page = createBlogPostPage("My First Blog");
    expect(page.title).toBe("My First Blog");
    expect(page.slug).toBe("my-first-blog");
    expect(page.description).toContain("Blog post");
  });

  it("creates product pages", () => {
    const page = createProductPage("Premium Service");
    expect(page.title).toBe("Premium Service");
    expect(page.nodes[0].children).toContainEqual(
      expect.objectContaining({
        type: "Image",
      }),
    );
  });

  it("creates documentation pages", () => {
    const page = createDocPage("API Documentation");
    expect(page.slug).toContain("docs-");
    expect(page.title).toBe("API Documentation");
  });

  it("includes layout settings", () => {
    const page = createSimplePage();
    expect(page.settings).toEqual({ cssVariables: {} });
  });
});

describe("Test Data Generator - Layout Creation", () => {
  it("creates simple layouts", () => {
    const layout = createSimpleLayout();
    expect(layout.id).toBeDefined();
    expect(layout.name).toBe("Test Layout");
    expect(layout.slots).toBeDefined();
  });

  it("creates two-column layouts", () => {
    const layout = createTwoColumnLayout();
    expect(layout.name).toBe("Two Column Layout");
    expect(layout.slots).toContainEqual(
      expect.objectContaining({
        name: "sidebar",
      }),
    );
  });

  it("creates blog layouts", () => {
    const layout = createBlogLayout();
    expect(layout.slots).toHaveLength(4);
    expect(layout.slots.map((s) => s.name)).toContain("header");
    expect(layout.slots.map((s) => s.name)).toContain("main");
    expect(layout.slots.map((s) => s.name)).toContain("footer");
  });

  it("includes main slot as required", () => {
    const layout = createSimpleLayout();
    const mainSlot = layout.slots.find((s) => s.name === "main");
    expect(mainSlot?.required).toBe(true);
  });
});

describe("Test Data Generator - Component Creation", () => {
  it("creates simple components", () => {
    const component = createSimpleComponent();
    expect(component.id).toBeDefined();
    expect(component.name).toBe("Test Component");
    expect(component.category).toBe("custom");
    expect(component.nodes).toBeDefined();
  });

  it("creates button components", () => {
    const component = createButtonComponent();
    expect(component.name).toBe("Button");
    expect(component.category).toBe("interactive");
  });

  it("creates card components", () => {
    const component = createCardComponent();
    expect(component.name).toBe("Card");
    expect(component.category).toBe("layout");
  });

  it("creates hero components", () => {
    const component = createHeroComponent();
    expect(component.name).toBe("Hero Section");
    expect(component.category).toBe("section");
  });

  it("creates hydrated components with directives", () => {
    const component = createHydratedComponent("MyComponent", "idle");
    expect(component.hydration?.mode).toBe("idle");
  });

  it("supports various hydration modes", () => {
    const modes: Array<
      "static" | "load" | "idle" | "visible" | "media" | "only"
    > = ["static", "load", "idle", "visible", "media", "only"];
    const components = modes.map((mode) =>
      createHydratedComponent(`Component${mode}`, mode),
    );
    expect(components).toHaveLength(6);
    components.forEach((c, i) => {
      expect(c.hydration?.mode).toBe(modes[i]);
    });
  });
});

describe("Test Data Generator - Collections", () => {
  it("creates page collections", () => {
    const pages = createPageCollection();
    expect(pages.length).toBeGreaterThan(5);
    expect(pages[0].title).toBe("Landing Page");
  });

  it("creates layout collections", () => {
    const layouts = createLayoutCollection();
    expect(layouts.length).toBeGreaterThan(2);
  });

  it("creates component collections", () => {
    const components = createComponentCollection();
    expect(components.length).toBeGreaterThan(5);
  });

  it("creates complete test data bundle", () => {
    const bundle = createTestDataBundle();
    expect(bundle.pages).toBeDefined();
    expect(bundle.layouts).toBeDefined();
    expect(bundle.components).toBeDefined();
    expect(bundle.pages.length).toBeGreaterThan(0);
    expect(bundle.layouts.length).toBeGreaterThan(0);
    expect(bundle.components.length).toBeGreaterThan(0);
  });
});

describe("Test Data Generator - Type Safety", () => {
  let testPage: PageDSL;
  let testLayout: LayoutDSL;
  let testComponent: ComponentDSL;

  beforeEach(() => {
    testPage = createSimplePage();
    testLayout = createSimpleLayout();
    testComponent = createSimpleComponent();
  });

  it("creates pages with required fields", () => {
    expect(testPage.id).toBeTruthy();
    expect(testPage.title).toBeTruthy();
    expect(testPage.slug).toBeTruthy();
    expect(testPage.layout).toBeTruthy();
    expect(testPage.nodes).toBeTruthy();
    expect(testPage.status).toBeTruthy();
  });

  it("creates layouts with required fields", () => {
    expect(testLayout.id).toBeTruthy();
    expect(testLayout.name).toBeTruthy();
    expect(testLayout.nodes).toBeTruthy();
    expect(testLayout.slots).toBeTruthy();
  });

  it("creates components with required fields", () => {
    expect(testComponent.id).toBeTruthy();
    expect(testComponent.name).toBeTruthy();
    expect(testComponent.category).toBeTruthy();
    expect(testComponent.nodes).toBeTruthy();
  });

  it("supports overrides for customization", () => {
    const customPage = createSimplePage("Custom Title", {
      status: "published",
      description: "Custom description",
    });
    expect(customPage.title).toBe("Custom Title");
    expect(customPage.status).toBe("published");
    expect(customPage.description).toBe("Custom description");
  });
});

describe("Test Data Generator - Real World Scenarios", () => {
  it("creates a complete blog site structure", () => {
    const pages = [
      createBlogPostPage("First Post"),
      createBlogPostPage("Second Post"),
      createBlogPostPage("Third Post"),
    ];
    const layout = createBlogLayout();

    expect(pages).toHaveLength(3);
    expect(layout.slots.map((s) => s.name)).toContain("sidebar");
    pages.forEach((page) => {
      expect(page.layout).toBe("default");
    });
  });

  it("creates a product marketing site", () => {
    const pages = [
      createLandingPage(),
      createProductPage("Product A"),
      createProductPage("Product B"),
    ];
    expect(pages).toHaveLength(3);
    expect(pages[0].title).toBe("Landing Page");
  });

  it("creates interactive component library", () => {
    const components = [
      createButtonComponent(),
      createCardComponent(),
      createHeroComponent(),
      createHydratedComponent("Form", "load"),
      createHydratedComponent("Slider", "idle"),
    ];
    expect(components).toHaveLength(5);
    const interactive = components.filter((c) => c.category === "interactive");
    expect(interactive.length).toBeGreaterThan(0);
  });
});
