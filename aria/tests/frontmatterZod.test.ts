import { describe, it, expect } from "vitest";
import { validateFrontmatterWithZod } from "../lib/schemas/frontmatter";
import {
  LANDING_PAGE_SCHEMA,
  BLOG_POST_SCHEMA,
  PRODUCT_PAGE_SCHEMA,
  DOCS_PAGE_SCHEMA,
} from "../lib/schemas/frontmatter";

function expectMissingFieldIssue(
  issues: { path: PropertyKey[]; message: string }[],
  field: string,
) {
  const issue = issues.find((entry) => entry.path[0] === field);
  expect(issue).toBeDefined();
  expect(issue?.message).toMatch(/required/);
}

describe("Frontmatter Zod Validation", () => {
  it("validates correct landing page frontmatter", () => {
    const data = {
      title: "Welcome",
      icon: "🚀",
      theme_color: "#0066cc",
      cta_text: "Get Started",
      cta_link: "/signup",
    };
    const result = validateFrontmatterWithZod(LANDING_PAGE_SCHEMA, data);
    expect(result.success).toBe(true);
  });

  it("fails on missing required landing page title", () => {
    const data = {
      icon: "🚀",
    };
    const result = validateFrontmatterWithZod(LANDING_PAGE_SCHEMA, data);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expectMissingFieldIssue(result.error!.issues, "title");
  });

  it("validates correct blog post frontmatter", () => {
    const data = {
      title: "My Blog",
      featured_image: "/uploads/cover.jpg",
      category: "engineering",
      tags: ["astro", "typescript"],
      reading_time_minutes: 5,
      featured: true,
    };
    const result = validateFrontmatterWithZod(BLOG_POST_SCHEMA, data);
    expect(result.success).toBe(true);
  });

  it("fails on missing required blog post featured_image", () => {
    const data = {
      title: "My Blog",
      category: "engineering",
    };
    const result = validateFrontmatterWithZod(BLOG_POST_SCHEMA, data);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expectMissingFieldIssue(result.error!.issues, "featured_image");
  });

  it("validates correct product page frontmatter", () => {
    const data = {
      title: "Super Widget",
      product_sku: "PROD-001",
      price_usd: 99.99,
      product_image: "/uploads/widget.jpg",
      in_stock: true,
      rating: 4.5,
    };
    const result = validateFrontmatterWithZod(PRODUCT_PAGE_SCHEMA, data);
    expect(result.success).toBe(true);
  });

  it("fails on missing required product page product_sku", () => {
    const data = {
      title: "Super Widget",
      price_usd: 99.99,
      product_image: "/uploads/widget.jpg",
    };
    const result = validateFrontmatterWithZod(PRODUCT_PAGE_SCHEMA, data);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expectMissingFieldIssue(result.error!.issues, "product_sku");
  });

  it("validates correct docs page frontmatter", () => {
    const data = {
      title: "Getting Started",
      doc_version: "v1.0.0",
      status: "published",
      table_of_contents: true,
      difficulty: "beginner",
    };
    const result = validateFrontmatterWithZod(DOCS_PAGE_SCHEMA, data);
    expect(result.success).toBe(true);
  });

  it("fails on missing required docs page doc_version", () => {
    const data = {
      title: "Getting Started",
      status: "published",
    };
    const result = validateFrontmatterWithZod(DOCS_PAGE_SCHEMA, data);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expectMissingFieldIssue(result.error!.issues, "doc_version");
  });
});
