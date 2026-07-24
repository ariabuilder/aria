#!/usr/bin/env node

/**
 * Options: --pages Seed only pages --layouts Seed only layouts --components Seed only components
 * --count N Number of items to generate (default: 5) --clear Clear existing data.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  createPageCollection,
  createLayoutCollection,
  createComponentCollection,
  createBlogPostPage,
  createProductPage,
  createDocPage,
} from "../tests/fixtures/testDataGenerator";

interface SeedOptions {
  pages: boolean;
  layouts: boolean;
  components: boolean;
  count: number;
  clear: boolean;
  outputDir: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    pages: true,
    layouts: true,
    components: true,
    count: 5,
    clear: false,
    outputDir: path.join(process.cwd(), "aria/storage/dsl"),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--pages-only") {
      options.layouts = false;
      options.components = false;
    } else if (arg === "--layouts-only") {
      options.pages = false;
      options.components = false;
    } else if (arg === "--components-only") {
      options.pages = false;
      options.layouts = false;
    } else if (arg === "--count" && args[i + 1]) {
      options.count = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--clear") {
      options.clear = true;
    } else if (arg === "--output" && args[i + 1]) {
      options.outputDir = args[i + 1];
      i++;
    }
  }

  return options;
}

async function ensureOutputDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function clearData(dir: string): Promise<void> {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        await fs.unlink(filePath);
      }
    }
    console.log(`✓ Cleared existing data in ${dir}`);
  } catch (err) {
    console.error(`Error clearing data: ${err}`);
  }
}

/**
 * Save pages to disk
 */
async function seedPages(outputDir: string, count: number): Promise<number> {
  const pagesDir = path.join(outputDir, "pages");
  await ensureOutputDir(pagesDir);

  const pages = [...createPageCollection()];

  // Add additional pages based on count
  for (let i = pages.length; i < count; i++) {
    const types = ["blog", "product", "doc"];
    const type = types[i % types.length];

    if (type === "blog") {
      pages.push(createBlogPostPage(`Blog Post ${i + 1}`));
    } else if (type === "product") {
      pages.push(createProductPage(`Product ${i + 1}`));
    } else {
      pages.push(createDocPage(`Documentation ${i + 1}`));
    }
  }

  for (const page of pages.slice(0, count)) {
    const fileName = `${page.slug}.json`;
    const filePath = path.join(pagesDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(page, null, 2));
  }

  console.log(`✓ Seeded ${Math.min(pages.length, count)} pages`);
  return Math.min(pages.length, count);
}

/**
 * Save layouts to disk
 */
async function seedLayouts(outputDir: string, count: number): Promise<number> {
  const layoutsDir = path.join(outputDir, "layouts");
  await ensureOutputDir(layoutsDir);

  const layouts = createLayoutCollection();

  for (let i = 0; i < Math.min(layouts.length, count); i++) {
    const layout = layouts[i];
    const fileName = `${layout.id}.json`;
    const filePath = path.join(layoutsDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(layout, null, 2));
  }

  console.log(`✓ Seeded ${Math.min(layouts.length, count)} layouts`);
  return Math.min(layouts.length, count);
}

/**
 * Save components to disk
 */
async function seedComponents(
  outputDir: string,
  count: number,
): Promise<number> {
  const componentsDir = path.join(outputDir, "components");
  await ensureOutputDir(componentsDir);

  const components = createComponentCollection();

  for (let i = 0; i < Math.min(components.length, count); i++) {
    const component = components[i];
    const fileName = `${component.id}.json`;
    const filePath = path.join(componentsDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(component, null, 2));
  }

  console.log(`✓ Seeded ${Math.min(components.length, count)} components`);
  return Math.min(components.length, count);
}

async function generateManifest(
  outputDir: string,
  stats: { pages: number; layouts: number; components: number },
): Promise<void> {
  const manifest = {
    timestamp: new Date().toISOString(),
    stats,
  };

  const manifestPath = path.join(outputDir, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✓ Generated manifest at ${manifestPath}`);
}

async function seed(): Promise<void> {
  const options = parseArgs();

  console.log("🌱 Seeding test data...\n");
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Max items per type: ${options.count}`);
  console.log();

  await ensureOutputDir(options.outputDir);

  // Clear existing data if requested
  if (options.clear) {
    await clearData(options.outputDir);
  }

  const stats = {
    pages: 0,
    layouts: 0,
    components: 0,
  };

  if (options.pages) {
    stats.pages = await seedPages(options.outputDir, options.count);
  }

  if (options.layouts) {
    stats.layouts = await seedLayouts(options.outputDir, options.count);
  }

  if (options.components) {
    stats.components = await seedComponents(options.outputDir, options.count);
  }

  await generateManifest(options.outputDir, stats);

  console.log(`\n✅ Seeding complete!`);
  console.log(
    `\nTotal seeded: ${stats.pages + stats.layouts + stats.components} items`,
  );
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
