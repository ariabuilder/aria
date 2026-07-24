# Test Data Generation System

A comprehensive test data generator for creating realistic pages, layouts, and components for testing the Aria builder system.

## Quick Start

### Using in Tests

```typescript
import {
  createSimplePage,
  createBlogPostPage,
  createLandingPage,
} from "../tests/fixtures/testDataGenerator";

describe("My Tests", () => {
  it("should handle pages", () => {
    const page = createSimplePage("My Test Page");
    expect(page.title).toBe("My Test Page");
  });
});
```

### Seeding Storage

```bash
# Seed all data types
npx tsx aria/scripts/seedTestData.ts

# Seed only pages
npx tsx aria/scripts/seedTestData.ts --pages-only

# Seed with 10 items of each type
npx tsx aria/scripts/seedTestData.ts --count 10

# Clear existing data first
npx tsx aria/scripts/seedTestData.ts --clear

# Custom output directory
npx tsx aria/scripts/seedTestData.ts --output ./custom-storage
```

## API Reference

### Node Creation

#### `generateId(): string`

Generates a unique UUID for nodes.

```typescript
const id = generateId(); // "a1b2c3d4-e5f6-..."
```

#### `generateSlug(title: string): string`

Creates URL-friendly slugs from strings.

```typescript
generateSlug("Hello World"); // "hello-world"
```

#### `createNode(overrides?: Partial<BuilderNode>): BuilderNode`

Creates a basic container node.

```typescript
const node = createNode({
  type: "Div",
  props: { className: "container" },
});
```

#### `createTextNode(content: string): BuilderNode`

Creates a text node.

```typescript
const text = createTextNode("Hello World");
```

#### `createHeadingNode(level, content): BuilderNode`

Creates heading nodes (h1-h6).

```typescript
const h1 = createHeadingNode(1, "Main Title");
const h2 = createHeadingNode(2, "Subtitle");
```

#### `createButtonNode(label): BuilderNode`

Creates button nodes.

```typescript
const btn = createButtonNode("Click Me");
```

#### `createImageNode(src, alt?): BuilderNode`

Creates image nodes.

```typescript
const img = createImageNode("/uploads/photo.jpg", "My Photo");
```

#### `createContainerNode(children?, overrides?): BuilderNode`

Creates container nodes with children.

```typescript
const container = createContainerNode([
  createTextNode("Item 1"),
  createTextNode("Item 2"),
]);
```

### Page Creation

#### `createSimplePage(title?, overrides?): PageDSL`

Creates a basic page with standard structure.

```typescript
const page = createSimplePage("My Page", {
  status: "published",
  description: "Custom description",
});
```

#### `createLandingPage(overrides?): PageDSL`

Creates a landing page with CTA buttons.

```typescript
const landing = createLandingPage();
```

#### `createBlogPostPage(title?, overrides?): PageDSL`

Creates a blog post page with sections.

```typescript
const post = createBlogPostPage("My Article");
```

#### `createProductPage(name?, overrides?): PageDSL`

Creates a product page with features and pricing.

```typescript
const product = createProductPage("Premium Plan");
```

#### `createDocPage(topic?, overrides?): PageDSL`

Creates documentation pages.

```typescript
const docs = createDocPage("API Reference");
```

### Layout Creation

#### `createSimpleLayout(name?, overrides?): LayoutDSL`

Creates a basic layout with slots.

```typescript
const layout = createSimpleLayout("My Layout");
```

#### `createTwoColumnLayout(overrides?): LayoutDSL`

Creates a two-column layout with sidebar.

```typescript
const twoCol = createTwoColumnLayout();
```

#### `createBlogLayout(overrides?): LayoutDSL`

Creates a blog layout with header, main, sidebar, and footer.

```typescript
const blog = createBlogLayout();
```

### Component Creation

#### `createSimpleComponent(name?, overrides?): ComponentDSL`

Creates a basic reusable component.

```typescript
const comp = createSimpleComponent("My Component");
```

#### `createButtonComponent(overrides?): ComponentDSL`

Creates a reusable button component.

```typescript
const btn = createButtonComponent();
```

#### `createCardComponent(overrides?): ComponentDSL`

Creates a card component with title and content.

```typescript
const card = createCardComponent();
```

#### `createHeroComponent(overrides?): ComponentDSL`

Creates a hero section component.

```typescript
const hero = createHeroComponent();
```

#### `createHydratedComponent(name, mode?, overrides?): ComponentDSL`

Creates components with Astro island directives.

```typescript
const interactive = createHydratedComponent("Counter", "load");
const lazy = createHydratedComponent("Carousel", "idle");
const visible = createHydratedComponent("Modal", "visible");
```

Supported hydration modes:

- `"static"` - No hydration
- `"load"` - Load immediately
- `"idle"` - Load when idle
- `"visible"` - Load when visible
- `"media"` - Load based on media query
- `"only"` - Client-only

### Collections

#### `createPageCollection(): PageDSL[]`

Creates a diverse collection of 8 pre-built pages.

```typescript
const pages = createPageCollection();
// Returns: landing, 2 blog posts, 2 products, 3 docs
```

#### `createLayoutCollection(): LayoutDSL[]`

Creates 4 different layouts.

```typescript
const layouts = createLayoutCollection();
// Returns: simple, minimal, two-column, blog
```

#### `createComponentCollection(): ComponentDSL[]`

Creates 7 different components including interactive ones.

```typescript
const components = createComponentCollection();
// Returns: simple, button, card, hero, + 3 hydrated
```

#### `createTestDataBundle(): TestDataBundle`

Creates a complete bundle with pages, layouts, and components.

```typescript
const bundle = createTestDataBundle();
console.log(bundle.pages.length); // 8
console.log(bundle.layouts.length); // 4
console.log(bundle.components.length); // 7
```

## Examples

### Example 1: Basic Page Testing

```typescript
import { createBlogPostPage } from "../tests/fixtures/testDataGenerator";
import { SQLiteStorageAdapter } from "../lib/storage/sqlite";

describe("Page Storage", () => {
  it("should save and retrieve blog posts", async () => {
    const adapter = new SQLiteStorageAdapter();
    const post = createBlogPostPage("My First Post");

    const version = await adapter.savePageDSL(post.id, post);
    const retrieved = await adapter.getPageDSL(post.id);

    expect(retrieved?.title).toBe("My First Post");
  });
});
```

### Example 2: Component Library Testing

```typescript
import {
  createButtonComponent,
  createCardComponent,
  createHeroComponent,
  createHydratedComponent,
} from "../tests/fixtures/testDataGenerator";

describe("Component Library", () => {
  it("should handle various component types", () => {
    const components = [
      createButtonComponent(),
      createCardComponent(),
      createHeroComponent(),
      createHydratedComponent("Modal", "visible"),
    ];

    expect(components).toHaveLength(4);
    expect(components.some((c) => c.hydration)).toBe(true);
  });
});
```

### Example 3: Full Site Structure

```typescript
import {
  createPageCollection,
  createLayoutCollection,
  createBlogLayout,
} from "../tests/fixtures/testDataGenerator";

// Create a complete blog site
const pages = createPageCollection();
const blogLayout = createBlogLayout();

// Assign blog layout to blog posts
const blogPosts = pages.filter((p) => p.slug.includes("blog"));
blogPosts.forEach((post) => {
  post.layout = blogLayout.id;
});
```

### Example 4: Custom Overrides

```typescript
import {
  createSimplePage,
  createHeadingNode,
  createTextNode,
} from "../tests/fixtures/testDataGenerator";

const customPage = createSimplePage("Custom Page", {
  status: "published",
  description: "A fully customized page",
  nodes: [
    {
      id: "custom-1",
      type: "Container",
      props: { className: "max-w-4xl mx-auto" },
      styles: { padding: "2rem" },
      children: [
        createHeadingNode(1, "Welcome!"),
        createTextNode("This is a custom page structure."),
      ],
    },
  ],
});
```

## File Structure

```
aria/
├── tests/
│   └── fixtures/
│       ├── testDataGenerator.ts        # Main factory functions
│       └── testDataGenerator.test.ts   # Comprehensive test suite
└── scripts/
    └── seedTestData.ts                 # CLI script to seed storage
```

## Testing

Run the test suite to verify the test data generator:

```bash
cd /path/to/aria
npx vitest run aria/tests/fixtures/testDataGenerator.test.ts
```

The test suite includes:

- 40+ test cases covering all factory functions
- Type safety validation
- Real-world scenario tests
- Collection and bundle generation tests

## Notes

- All generated IDs are UUIDs (guaranteed unique)
- Slugs are automatically generated from titles unless overridden
- Pages include default Tailwind breakpoints
- Layouts include customizable slots
- All factories support TypeScript-style overrides
- Hydration modes match Astro island directives exactly

## Integration with Storage

The generated data can be saved using the storage adapters:

```typescript
import { SQLiteStorageAdapter } from "../lib/storage/sqlite";
import { createTestDataBundle } from "./fixtures/testDataGenerator";

const adapter = new SQLiteStorageAdapter();
const bundle = createTestDataBundle();

// Save all pages
for (const page of bundle.pages) {
  await adapter.savePageDSL(page.id, page);
}

// Save all layouts
for (const layout of bundle.layouts) {
  await adapter.saveLayoutDSL(layout.id, layout);
}

// Save all components
for (const component of bundle.components) {
  await adapter.saveComponentDSL(component.id, component);
}
```

## Common Patterns

### Creating Multiple Pages of Same Type

```typescript
const posts = Array.from({ length: 5 }, (_, i) =>
  createBlogPostPage(`Blog Post ${i + 1}`),
);
```

### Building a Component Library

```typescript
const components = [
  createSimpleComponent("Alert"),
  createSimpleComponent("Badge"),
  createSimpleComponent("Breadcrumb"),
  createButtonComponent(),
  createCardComponent(),
  createHeroComponent(),
];
```

### Creating Custom Layouts

```typescript
const customLayout = createSimpleLayout("Custom", {
  slots: [
    { name: "header", required: false, label: "Header" },
    { name: "nav", required: true, label: "Navigation" },
    { name: "main", required: true, label: "Main" },
    { name: "footer", required: false, label: "Footer" },
  ],
});
```

## Troubleshooting

**Issue: "Module not found" error**

- Ensure you're using `tsx` for TypeScript execution: `npx tsx aria/scripts/seedTestData.ts`

**Issue: Files not created**

- Check the output directory exists and is writable
- Use `--output` flag to specify a different directory
- Run with `--clear` to clean up first

**Issue: Type errors in tests**

- Import types from `aria/lib/types/nodes`
- Ensure TypeScript version is ^5.0

## Future Enhancements

- [ ] Database seeding integration
- [ ] Faker.js integration for realistic content
- [ ] Batch generation with progress reporting
- [ ] Export to different formats (YAML, CSV, etc.)
- [ ] Version history generation
- [ ] Media asset linking
