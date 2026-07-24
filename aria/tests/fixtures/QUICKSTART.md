# Test Data Quick Reference

## Installation & Setup

All test data functionality is already included in the project. No additional installation needed.

## Files Created

```
aria/tests/fixtures/
├── testDataGenerator.ts          # Main factory functions (200+ LOC)
├── testDataGenerator.test.ts     # 40+ test cases
├── storageIntegration.test.ts    # Real-world integration scenarios
└── README.md                      # Full documentation

aria/scripts/
└── seedTestData.ts               # CLI script for seeding storage
```

## Quickest Start

### In Your Tests

```typescript
// Import what you need
import {
  createSimplePage,
  createBlogPostPage,
  createButtonComponent,
  createTestDataBundle,
} from "../tests/fixtures/testDataGenerator";

// Use it
const page = createBlogPostPage("My Article");
const component = createButtonComponent();
const everything = createTestDataBundle();
```

### Generate Test Data Files

```bash
# Create pages, layouts, and components in aria/storage/dsl
npx tsx aria/scripts/seedTestData.ts

# Just pages
npx tsx aria/scripts/seedTestData.ts --pages-only

# More items
npx tsx aria/scripts/seedTestData.ts --count 20
```

## Most Common Operations

### Create a Single Page

```typescript
const page = createSimplePage("My Page");
const blog = createBlogPostPage("Article Title");
const product = createProductPage("Product Name");
const docs = createDocPage("Topic");
const landing = createLandingPage();
```

### Create Components

```typescript
const button = createButtonComponent();
const card = createCardComponent();
const hero = createHeroComponent();
const interactive = createHydratedComponent("Modal", "visible");
```

### Create Layouts

```typescript
const simple = createSimpleLayout();
const twoCol = createTwoColumnLayout();
const blog = createBlogLayout();
```

### Get Everything

```typescript
const bundle = createTestDataBundle();
// bundle.pages (8 items)
// bundle.layouts (4 items)
// bundle.components (7 items)
```

### Save to Storage

```typescript
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createTestDataBundle } from "../fixtures/testDataGenerator";

const adapter = new SQLiteStorageAdapter();
const bundle = createTestDataBundle();

// Save pages
for (const page of bundle.pages) {
  await adapter.savePageDSL(page.id, page);
}

// Save layouts
for (const layout of bundle.layouts) {
  await adapter.saveLayoutDSL(layout.id, layout);
}

// Save components
for (const comp of bundle.components) {
  await adapter.saveComponentDSL(comp.id, comp);
}
```

## Node Building Blocks

```typescript
// Text content
createTextNode("Hello World");

// Headings (h1-h6)
createHeadingNode(1, "Title");
createHeadingNode(2, "Subtitle");

// Interactive
createButtonNode("Click Me");

// Media
createImageNode("/img.jpg", "Alt text");

// Container
createContainerNode([createTextNode("Child 1"), createTextNode("Child 2")]);
```

## Hydration Modes

When creating interactive components:

```typescript
// Immediate load (for interactive UI)
createHydratedComponent("Form", "load");

// Wait for idle time (for less critical UI)
createHydratedComponent("Sidebar", "idle");

// Load when visible (for off-screen elements)
createHydratedComponent("Modal", "visible");

// Media queries (responsive)
createHydratedComponent("Tablet Menu", "media");

// Client-only (no SSR)
createHydratedComponent("Analytics", "only");

// Static (no hydration needed)
createHydratedComponent("Header", "static");
```

## Collections (Pre-made Bundles)

```typescript
// 8 diverse pages
const pages = createPageCollection();

// 4 different layouts
const layouts = createLayoutCollection();

// 7 components including interactive
const components = createComponentCollection();

// Everything together
const all = createTestDataBundle();
```

## Real-World Examples

### Blog Site

```typescript
const pages = Array.from({ length: 10 }, (_, i) =>
  createBlogPostPage(`Blog Post ${i + 1}`),
);
const layout = createBlogLayout();
// Connect pages to layout and save
```

### Product Showcase

```typescript
const products = [
  createProductPage("Starter"),
  createProductPage("Professional"),
  createProductPage("Enterprise"),
];
const landing = createLandingPage();
// Save all pages
```

### Component Library

```typescript
const components = [
  createButtonComponent(),
  createCardComponent(),
  createHeroComponent(),
  createHydratedComponent("Modal", "visible"),
  createHydratedComponent("Carousel", "idle"),
];
// Save to storage
```

## Testing

Run all test data tests:

```bash
npx vitest run aria/tests/fixtures/
```

Run specific tests:

```bash
npx vitest run aria/tests/fixtures/testDataGenerator.test.ts
npx vitest run aria/tests/fixtures/storageIntegration.test.ts
```

Run in watch mode:

```bash
npx vitest aria/tests/fixtures/
```

## Common Customizations

### Custom Page

```typescript
const custom = createSimplePage("My Page", {
  status: "published",
  description: "Custom description",
  nodes: [
    /* custom nodes */
  ],
});
```

### Custom Component

```typescript
const custom = createSimpleComponent("MyComp", {
  category: "interactive",
  hydration: { mode: "load" },
  nodes: [
    /* custom nodes */
  ],
});
```

### Custom Layout

```typescript
const custom = createSimpleLayout("MyLayout", {
  slots: [
    { name: "header", required: true, label: "Header" },
    { name: "main", required: true, label: "Main" },
    { name: "footer", required: true, label: "Footer" },
  ],
});
```

## Data Structure Overview

### PageDSL

- `id`: UUID
- `title`: string
- `slug`: URL-friendly string
- `description`: string
- `layout`: string (reference to layout ID)
- `nodes`: BuilderNode[]
- `status`: "draft" | "published"
- `settings`: CSS variables, breakpoints, styling mode

### LayoutDSL

- `id`: UUID
- `name`: string
- `description`: string
- `nodes`: BuilderNode[]
- `slots`: Array of { name, required, label }

### ComponentDSL

- `id`: UUID
- `name`: string
- `description`: string
- `category`: string
- `nodes`: BuilderNode[]
- `hydration`: Optional HydrationDirective

### BuilderNode

- `id`: UUID
- `type`: string (Container, Text, Button, Image, etc.)
- `props`: object
- `styles`: object
- `children`: BuilderNode[]

## Environment Variables

No special environment variables needed. The test data generator uses:

- `process.cwd()` for file paths
- Default output: `aria/storage/dsl/`

Use `--output` flag to change output directory.

## Tips & Tricks

1. **Batch generation**: Use `Array.from()` to create multiple items
2. **Collections first**: Use `createPageCollection()` as a starting point
3. **Override specific fields**: Pass override object for customization
4. **Type safety**: All factories are fully typed
5. **Reuse in tests**: Import collection once, spread across tests

## Troubleshooting

**Q: Files not being created?**

- Ensure `aria/storage/dsl` directory is writable
- Check permissions: `chmod -R 755 aria/storage/`

**Q: TypeScript errors?**

- Ensure imports from `aria/lib/types/nodes`
- Use `tsx` not `ts-node` for running scripts

**Q: Want different content?**

- Edit the factory functions in `testDataGenerator.ts`
- Or pass overrides to factories

**Q: Need more test items?**

- Use `--count N` flag in seed script
- Or create custom factory functions

## Next Steps

1. Run the test suite to see it all in action
2. Try the seed script to generate files
3. Import generators in your tests
4. Create custom factories for your needs

## Files to Check Out

- `testDataGenerator.ts` - All factory functions (start here)
- `testDataGenerator.test.ts` - 40+ examples of usage
- `storageIntegration.test.ts` - Real-world scenarios
- `README.md` - Complete API reference
