import { describe, expect, it } from "vitest";
import {
  compileCollectionSchema,
  hashCollectionSchema,
  validateCollectionSchema,
  validateEntryFrontmatter,
} from "../../../lib/cms/schema/compiler";
import type { CollectionSchema } from "../../../lib/cms/schemas";

function baseSchema(overrides?: Partial<CollectionSchema>): CollectionSchema {
  return {
    id: "posts",
    label: "Posts",
    kind: "content",
    fields: [],
    version: 1,
    ...overrides,
  };
}

describe("cms schema compiler", () => {
  it("rejects reserved field keys", () => {
    const errors = validateCollectionSchema(
      baseSchema({
        fields: [{ key: "slug", label: "Slug", type: "slug" }],
      }),
    );
    expect(errors.some((error) => error.includes("reserved"))).toBe(true);
  });

  it("requires options for select fields", () => {
    const errors = validateCollectionSchema(
      baseSchema({
        fields: [{ key: "category", label: "Category", type: "select" }],
      }),
    );
    expect(errors.some((error) => error.includes("options"))).toBe(true);
  });

  it("compiles frontmatter schema and validates values", () => {
    const schema = baseSchema({
      fields: [
        { key: "excerpt", label: "Excerpt", type: "text", required: true },
        { key: "icon", label: "Icon", type: "icon" },
        { key: "featured", label: "Featured", type: "boolean" },
      ],
    });

    const compiled = compileCollectionSchema(schema);
    expect(compiled.errors).toEqual([]);
    expect(compiled.hash).toBe(hashCollectionSchema(schema));

    expect(
      validateEntryFrontmatter(schema, {
        excerpt: "Hello",
        icon: "i-hugeicons:star",
        featured: true,
      }).success,
    ).toBe(true);

    const invalid = validateEntryFrontmatter(schema, { featured: true });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.errors.length).toBeGreaterThan(0);
    }
  });

  it("validates required icon fields as non-empty strings", () => {
    const schema = baseSchema({
      fields: [{ key: "icon", label: "Icon", type: "icon", required: true }],
    });

    expect(
      validateEntryFrontmatter(schema, {
        icon: "i-hugeicons:star",
      }).success,
    ).toBe(true);

    expect(validateEntryFrontmatter(schema, {}).success).toBe(false);
    expect(validateEntryFrontmatter(schema, { icon: "" }).success).toBe(false);
  });

  it("allows missing required values for draft validation only", () => {
    const schema = baseSchema({
      fields: [
        { key: "menu_item", label: "Menu Item", type: "string", required: true },
        { key: "menu_link", label: "Menu Link", type: "link", required: true },
      ],
    });

    const draft = validateEntryFrontmatter(
      schema,
      {
        menu_item: undefined,
        menu_link: undefined,
      },
      { allowMissingRequired: true },
    );
    expect(draft.success).toBe(true);

    const publishReady = validateEntryFrontmatter(schema, {
      menu_item: undefined,
      menu_link: undefined,
    });
    expect(publishReady.success).toBe(false);
    if (!publishReady.success) {
      expect(publishReady.errors.join("; ")).toContain("menu_item");
      expect(publishReady.errors.join("; ")).toContain("menu_link");
    }
  });

  it("does not require relation fields in frontmatter", () => {
    const schema = baseSchema({
      fields: [
        {
          key: "related_posts",
          label: "Related Posts",
          type: "relation",
          targetCollection: "posts",
          required: true,
        },
      ],
    });

    expect(validateEntryFrontmatter(schema, {}).success).toBe(true);
  });

  it("compiles nested repeater fields", () => {
    const schema = baseSchema({
      fields: [
        {
          key: "items",
          label: "Items",
          type: "repeater",
          fields: [{ key: "label", label: "Label", type: "string", required: true }],
        },
      ],
    });

    const compiled = compileCollectionSchema(schema);
    expect(compiled.errors).toEqual([]);
    const result = compiled.zodSchema.safeParse({
      items: [{ label: "One" }],
    });
    expect(result.success).toBe(true);
  });

  it("validates repeater display settings against nested fields", () => {
    expect(
      validateCollectionSchema(
        baseSchema({
          fields: [
            {
              key: "steps",
              label: "Steps",
              type: "repeater",
              fields: [{ key: "label", label: "Label", type: "string" }],
              repeaterDisplay: { titleFieldKey: "missing" },
            },
          ],
        }),
      ).some((error) => error.includes("repeaterDisplay.titleFieldKey")),
    ).toBe(true);

    expect(
      validateCollectionSchema(
        baseSchema({
          fields: [
            {
              key: "headline",
              label: "Headline",
              type: "string",
              repeaterDisplay: { addButtonLabel: "Add" },
            },
          ],
        }),
      ).some((error) => error.includes("only valid for repeater")),
    ).toBe(true);
  });
});
