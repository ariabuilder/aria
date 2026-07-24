/**
 * Factory functions for creating realistic test data for pages, layouts, and components.
 */

import type {
  PageDSL,
  LayoutDSL,
  ComponentDSL,
  BuilderNode,
  HydrationDirective,
} from "../../lib/types/nodes";

export const generateId = (): string => crypto.randomUUID();

/**
 * Creates a unique slug from a string
 * Matches regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
 */
export const generateSlug = (title: string): string => {
  // Start with lowercase
  let slug = String(title || "page")
    .toLowerCase()
    .trim();

  // Only keep lowercase, numbers, spaces, and hyphens
  slug = slug.replace(/[^a-z0-9\s\-]/g, "");

  // Replace spaces with hyphens
  slug = slug.replace(/\s+/g, "-");

  // Replace multiple hyphens with single
  slug = slug.replace(/-+/g, "-");

  slug = slug.replace(/^-+|-+$/g, "");

  // Fallback if empty
  if (!slug) slug = "page";

  // Truncate to reasonable length
  return slug.substring(0, 100);
};

export function createNode(overrides?: Partial<BuilderNode>): BuilderNode {
  const id = generateId();
  return {
    id,
    type: "Container",
    props: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

export function createTextNode(
  content: string,
  overrides?: Partial<BuilderNode>,
): BuilderNode {
  return createNode({
    type: "Text",
    props: { content },
    ...overrides,
  });
}

export function createHeadingNode(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: string,
  overrides?: Partial<BuilderNode>,
): BuilderNode {
  return createNode({
    type: "Heading",
    props: { level, content },
    ...overrides,
  });
}

export function createButtonNode(
  label: string,
  overrides?: Partial<BuilderNode>,
): BuilderNode {
  return createNode({
    type: "Button",
    props: { label, variant: "primary" },
    ...overrides,
  });
}

export function createImageNode(
  src: string,
  alt: string = "Image",
  overrides?: Partial<BuilderNode>,
): BuilderNode {
  return createNode({
    type: "Image",
    props: { src, alt },
    ...overrides,
  });
}

export function createContainerNode(
  children: BuilderNode[] = [],
  overrides?: Partial<BuilderNode>,
): BuilderNode {
  return createNode({
    type: "Container",
    children,
    ...overrides,
  });
}

/**
 * Factory for creating a simple page
 */
export function createSimplePage(
  title: string = "Test Page",
  overrides?: Partial<PageDSL>,
): PageDSL {
  const slug = generateSlug(title);
  return {
    id: generateId(),
    title,
    slug,
    description: `A test page: ${title}`,
    layout: "default",
    nodes: [
      createContainerNode([
        createHeadingNode(1, title),
        createTextNode("Welcome to this test page."),
        createButtonNode("Learn More"),
      ]),
    ],
    settings: {
      cssVariables: {},
    },
    status: "draft",
    ...overrides,
  };
}

/**
 * Factory for creating a landing page
 */
export function createLandingPage(overrides?: Partial<PageDSL>): PageDSL {
  return createSimplePage("Landing Page", {
    description: "High-converting landing page",
    nodes: [
      createContainerNode([
        createHeadingNode(1, "Welcome to Our Product"),
        createTextNode("Discover the best solution for your needs."),
        createContainerNode([
          createButtonNode("Get Started"),
          createButtonNode("Learn More"),
        ]),
      ]),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a blog post page
 */
export function createBlogPostPage(
  title: string = "Blog Post",
  overrides?: Partial<PageDSL>,
): PageDSL {
  const slug = generateSlug(title);
  return createSimplePage(title, {
    slug,
    description: `Blog post: ${title}`,
    nodes: [
      createContainerNode([
        createHeadingNode(1, title),
        createTextNode("Published on December 20, 2024"),
        createHeadingNode(2, "Introduction"),
        createTextNode("This is the introduction to the blog post."),
        createHeadingNode(2, "Main Content"),
        createTextNode("Here is the main content of the blog post."),
        createHeadingNode(2, "Conclusion"),
        createTextNode("Thanks for reading!"),
      ]),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a product page
 */
export function createProductPage(
  productName: string = "Product",
  overrides?: Partial<PageDSL>,
): PageDSL {
  return createSimplePage(productName, {
    description: `Product page for ${productName}`,
    nodes: [
      createContainerNode([
        createHeadingNode(1, productName),
        createImageNode("/uploads/product.jpg", productName),
        createHeadingNode(2, "Features"),
        createTextNode("✓ Feature 1"),
        createTextNode("✓ Feature 2"),
        createTextNode("✓ Feature 3"),
        createHeadingNode(2, "Pricing"),
        createTextNode("$99/month - Professional plan"),
        createButtonNode("Buy Now"),
      ]),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating documentation pages
 */
export function createDocPage(
  topic: string = "Documentation",
  overrides?: Partial<PageDSL>,
): PageDSL {
  return createSimplePage(topic, {
    slug: `docs-${generateSlug(topic)}`,
    description: `Documentation for ${topic}`,
    nodes: [
      createContainerNode([
        createHeadingNode(1, topic),
        createHeadingNode(2, "Getting Started"),
        createTextNode("Here's how to get started with " + topic),
        createHeadingNode(2, "Installation"),
        createTextNode("npm install @package/module"),
        createHeadingNode(2, "Usage"),
        createTextNode("import { Component } from '@package/module'"),
        createHeadingNode(2, "API Reference"),
        createTextNode("See below for detailed API docs..."),
      ]),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a simple layout
 */
export function createSimpleLayout(
  name: string = "Test Layout",
  overrides?: Partial<LayoutDSL>,
): LayoutDSL {
  return {
    id: generateId(),
    name,
    description: `A test layout: ${name}`,
    nodes: [
      createContainerNode([
        createHeadingNode(1, "Header"),
        createContainerNode([], { props: { slot: "main" } }),
        createTextNode("Footer content"),
      ]),
    ],
    slots: [
      { name: "header", required: false, label: "Header" },
      { name: "main", required: true, label: "Main Content" },
      { name: "sidebar", required: false, label: "Sidebar" },
      { name: "footer", required: false, label: "Footer" },
    ],
    ...overrides,
  };
}

/**
 * Factory for creating a two-column layout
 */
export function createTwoColumnLayout(
  overrides?: Partial<LayoutDSL>,
): LayoutDSL {
  return createSimpleLayout("Two Column Layout", {
    nodes: [
      createContainerNode([
        createContainerNode(
          [createContainerNode([], { props: { slot: "sidebar" } })],
          { props: { className: "w-1/4" } },
        ),
        createContainerNode(
          [createContainerNode([], { props: { slot: "main" } })],
          { props: { className: "w-3/4" } },
        ),
      ]),
    ],
    slots: [
      { name: "sidebar", required: false, label: "Sidebar" },
      { name: "main", required: true, label: "Main Content" },
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a blog layout
 */
export function createBlogLayout(overrides?: Partial<LayoutDSL>): LayoutDSL {
  return createSimpleLayout("Blog Layout", {
    nodes: [
      createContainerNode([
        createContainerNode([], { props: { slot: "header" } }),
        createContainerNode(
          [
            createContainerNode([], { props: { slot: "main" } }),
            createContainerNode([], { props: { slot: "sidebar" } }),
          ],
          { props: { className: "flex gap-8" } },
        ),
        createContainerNode([], { props: { slot: "footer" } }),
      ]),
    ],
    slots: [
      { name: "header", required: false, label: "Header" },
      { name: "main", required: true, label: "Main Content" },
      { name: "sidebar", required: false, label: "Sidebar" },
      { name: "footer", required: false, label: "Footer" },
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a simple component
 */
export function createSimpleComponent(
  name: string = "Test Component",
  overrides?: Partial<ComponentDSL>,
): ComponentDSL {
  return {
    id: generateId(),
    name,
    description: `A test component: ${name}`,
    category: "custom",
    nodes: [
      createContainerNode([
        createHeadingNode(3, name),
        createTextNode("This is a reusable component."),
      ]),
    ],
    ...overrides,
  };
}

/**
 * Factory for creating a button component
 */
export function createButtonComponent(
  overrides?: Partial<ComponentDSL>,
): ComponentDSL {
  return createSimpleComponent("Button", {
    category: "interactive",
    nodes: [
      createButtonNode("Click me", {
        props: {
          variant: "primary",
          size: "medium",
        },
      }),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a card component
 */
export function createCardComponent(
  overrides?: Partial<ComponentDSL>,
): ComponentDSL {
  return createSimpleComponent("Card", {
    category: "layout",
    nodes: [
      createContainerNode([
        createHeadingNode(3, "Card Title"),
        createTextNode("Card content goes here."),
        createButtonNode("Learn More"),
      ]),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a hero section component
 */
export function createHeroComponent(
  overrides?: Partial<ComponentDSL>,
): ComponentDSL {
  return createSimpleComponent("Hero Section", {
    category: "section",
    nodes: [
      createContainerNode([
        createHeadingNode(1, "Welcome to Our Hero Section"),
        createTextNode("This is a full-width hero component."),
        createContainerNode([
          createButtonNode("Get Started"),
          createButtonNode("Learn More"),
        ]),
      ]),
    ],
    ...overrides,
  });
}

/**
 * Factory for creating a hydrated component (with Astro island directive)
 * Hydration can be set at the component definition level.
 */
export function createHydratedComponent(
  name: string = "Interactive Component",
  hydrationMode: HydrationDirective["mode"] = "load",
  overrides?: Partial<ComponentDSL>,
): ComponentDSL {
  return createSimpleComponent(name, {
    category: "interactive",
    hydration: {
      mode: hydrationMode,
    },
    nodes: [
      createContainerNode([
        createTextNode(`This component uses ${hydrationMode} hydration`),
      ]),
    ],
    ...overrides,
  });
}

export function createPageCollection(): PageDSL[] {
  return [
    createLandingPage(),
    createBlogPostPage("Getting Started with Web Development"),
    createBlogPostPage("Advanced TypeScript Patterns"),
    createProductPage("Premium Plan"),
    createProductPage("Enterprise Solution"),
    createDocPage("Installation Guide"),
    createDocPage("API Reference"),
    createDocPage("Best Practices"),
  ];
}

export function createLayoutCollection(): LayoutDSL[] {
  return [
    createSimpleLayout(),
    createSimpleLayout("Minimal Layout"),
    createTwoColumnLayout(),
    createBlogLayout(),
  ];
}

export function createComponentCollection(): ComponentDSL[] {
  return [
    createSimpleComponent(),
    createButtonComponent(),
    createCardComponent(),
    createHeroComponent(),
    createHydratedComponent("Counter", "load"),
    createHydratedComponent("Carousel", "idle"),
    createHydratedComponent("Modal", "visible"),
  ];
}

export interface TestDataBundle {
  pages: PageDSL[];
  layouts: LayoutDSL[];
  components: ComponentDSL[];
}

export function createTestDataBundle(): TestDataBundle {
  return {
    pages: createPageCollection(),
    layouts: createLayoutCollection(),
    components: createComponentCollection(),
  };
}
