import { describe, expect, it } from "vitest";

import {
  buildFrontmatterFromDraft,
  cloneCmsRepeaterItemDraft,
  createFrontmatterDraft,
  editableCmsFields,
  resolveCmsRepeaterItemTitle,
} from "../../../admin/features/CMS/lib/frontmatterForm";
import { plainTextToStructuredText } from "../../../lib/cms/structuredText";
import type { FieldSchema } from "../../../lib/cms/schemas";

const fields = [
  { key: "headline", label: "Headline", type: "string", required: true },
  { key: "excerpt", label: "Excerpt", type: "text" },
  { key: "rank", label: "Rank", type: "integer" },
  { key: "score", label: "Score", type: "number" },
  { key: "featured", label: "Featured", type: "boolean" },
  {
    key: "category",
    label: "Category",
    type: "select",
    options: ["news", "notes"],
  },
  {
    key: "topics",
    label: "Topics",
    type: "multiSelect",
    options: ["cms", "studio"],
  },
  { key: "featureIcon", label: "Feature Icon", type: "icon" },
  { key: "accentColor", label: "Accent Color", type: "color" },
  { key: "story", label: "Story", type: "structuredText" },
  { key: "richBody", label: "Rich Body", type: "richtext" },
  { key: "metadata", label: "Metadata", type: "json" },
  { key: "hero", label: "Hero", type: "image" },
  { key: "download", label: "Download", type: "file" },
  {
    key: "author",
    label: "Author",
    type: "reference",
    targetCollection: "authors",
  },
  { key: "cta", label: "CTA", type: "link", targetCollection: "posts" },
] satisfies FieldSchema[];

describe("CMS frontmatter form", () => {
  it("creates editable drafts from schema fields and initial data", () => {
    const story = plainTextToStructuredText("Hello");
    const richBody = plainTextToStructuredText("Rich");
    const draft = createFrontmatterDraft(fields, {
      headline: "Launch",
      featured: true,
      featureIcon: "i-hugeicons:star",
      accentColor: "var(--primary-500)",
      story,
      richBody,
      hero: { mediaId: "media-1" },
      download: "media-file",
      cta: { type: "page", url: "/about", pageId: "page-about" },
    });

    expect(draft.headline).toBe("Launch");
    expect(draft.featured).toBe(true);
    expect(draft.featureIcon).toBe("i-hugeicons:star");
    expect(draft.accentColor).toBe("var(--primary-500)");
    expect(draft.story).toEqual(story);
    expect(draft.richBody).toEqual(richBody);
    expect(draft.topics).toEqual([]);
    expect(draft.hero).toEqual({ mediaId: "media-1" });
    expect(draft.download).toEqual({ mediaId: "media-file" });
    expect(draft.cta).toEqual({
      type: "page",
      url: "/about",
      pageId: "page-about",
      entryId: "",
      collectionId: "",
      slug: "",
      label: "",
      openInNewTab: false,
    });
  });

  it("coerces editable draft values into entry frontmatter", () => {
    const story = plainTextToStructuredText("Hello");
    const frontmatter = buildFrontmatterFromDraft(fields, {
      headline: " Launch ",
      excerpt: " Intro ",
      rank: "2",
      score: "4.5",
      featured: true,
      category: "news",
      topics: "cms, studio",
      featureIcon: " i-hugeicons:star ",
      accentColor: " #14b8a6 ",
      story,
      richBody: [],
      metadata: '{"source":"seed"}',
      hero: {
        mediaId: "media-hero",
        alt: " Hero alt ",
        caption: " ",
      },
      download: {
        mediaId: "media-file",
        label: " Spec sheet ",
      },
      author: "entry-author",
      cta: {
        type: "external",
        url: "example.com",
        label: " Read more ",
        openInNewTab: true,
      },
    });

    expect(frontmatter).toEqual({
      headline: "Launch",
      excerpt: "Intro",
      rank: 2,
      score: 4.5,
      featured: true,
      category: "news",
      topics: ["cms", "studio"],
      featureIcon: "i-hugeicons:star",
      accentColor: "#14b8a6",
      story,
      metadata: { source: "seed" },
      hero: { mediaId: "media-hero", alt: "Hero alt" },
      download: { mediaId: "media-file", label: "Spec sheet" },
      author: "entry-author",
      cta: {
        type: "external",
        url: "https://example.com",
        label: "Read more",
        openInNewTab: true,
      },
    });
  });

  it("serializes icon replacements and clears optional blank icons", () => {
    const iconFields = [
      { key: "icon", label: "Icon", type: "icon" },
      { key: "requiredIcon", label: "Required Icon", type: "icon", required: true },
    ] satisfies FieldSchema[];

    expect(
      buildFrontmatterFromDraft(iconFields, {
        icon: "i-hugeicons:moon-02",
        requiredIcon: " i-hugeicons:star ",
      }),
    ).toEqual({
      icon: "i-hugeicons:moon-02",
      requiredIcon: "i-hugeicons:star",
    });

    expect(
      buildFrontmatterFromDraft(iconFields, {
        icon: "",
        requiredIcon: "",
      }),
    ).toEqual({});
  });

  it("serializes color literals and references as strings", () => {
    const colorFields = [
      { key: "accentColor", label: "Accent Color", type: "color" },
      {
        key: "requiredColor",
        label: "Required Color",
        type: "color",
        required: true,
      },
    ] satisfies FieldSchema[];

    expect(
      buildFrontmatterFromDraft(colorFields, {
        accentColor: " var(--primary-500) ",
        requiredColor: " #14b8a680 ",
      }),
    ).toEqual({
      accentColor: "var(--primary-500)",
      requiredColor: "#14b8a680",
    });

    expect(
      buildFrontmatterFromDraft(colorFields, {
        accentColor: "",
        requiredColor: "",
      }),
    ).toEqual({});
  });

  it("coerces internal, page, entry, email, and phone link values", () => {
    const linkField = [
      { key: "link", label: "Link", type: "link", targetCollection: "posts" },
    ] satisfies FieldSchema[];

    expect(
      createFrontmatterDraft(linkField, {
        link: {
          type: "internal",
          url: "/about",
          label: "About",
          openInNewTab: true,
        },
      }),
    ).toEqual({
      link: {
        type: "internal",
        url: "/about",
        pageId: "",
        entryId: "",
        collectionId: "",
        slug: "",
        label: "About",
        openInNewTab: true,
      },
    });

    expect(
      buildFrontmatterFromDraft(linkField, {
        link: {
          type: "internal",
          url: "/about",
          label: " About ",
          pageId: "",
          entryId: "",
          collectionId: "",
          slug: "",
          openInNewTab: true,
        },
      }),
    ).toEqual({
      link: {
        type: "internal",
        url: "/about",
        label: "About",
        openInNewTab: true,
      },
    });

    expect(
      buildFrontmatterFromDraft(linkField, {
        link: {
          type: "entry",
          entryId: "entry-1",
          collectionId: "posts",
          slug: "hello-world",
          label: "Hello",
          url: "",
          pageId: "",
          openInNewTab: false,
        },
      }),
    ).toEqual({
      link: {
        type: "entry",
        entryId: "entry-1",
        collectionId: "posts",
        slug: "hello-world",
        label: "Hello",
      },
    });

    expect(
      buildFrontmatterFromDraft(linkField, {
        link: {
          type: "email",
          url: "hello@example.test",
          label: "",
          pageId: "",
          entryId: "",
          collectionId: "",
          slug: "",
          openInNewTab: false,
        },
      }),
    ).toEqual({ link: { type: "email", url: "mailto:hello@example.test" } });

    expect(
      buildFrontmatterFromDraft(linkField, {
        link: {
          type: "phone",
          url: "+1 555 123 4567",
          label: "",
          pageId: "",
          entryId: "",
          collectionId: "",
          slug: "",
          openInNewTab: false,
        },
      }),
    ).toEqual({ link: { type: "phone", url: "tel:+1 555 123 4567" } });
  });

  it("filters unsupported field types from editable fields", () => {
    const advancedFields = [
      ...fields,
      {
        key: "items",
        label: "Items",
        type: "repeater",
        fields: [{ key: "label", label: "Label", type: "string" }],
      },
      { key: "legacyRelation", label: "Legacy relation", type: "relation" },
    ] satisfies FieldSchema[];

    const editableKeys = editableCmsFields(advancedFields).map((field) => field.key);

    expect(editableKeys).toContain("items");
    expect(editableKeys).not.toContain("legacyRelation");
  });

  it("creates and serializes nested object and repeater values", () => {
    const nestedFields = [
      {
        key: "seo",
        label: "SEO",
        type: "object",
        fields: [
          { key: "title", label: "Title", type: "string" },
          { key: "noindex", label: "Noindex", type: "boolean" },
        ],
      },
      {
        key: "items",
        label: "Items",
        type: "repeater",
        fields: [
          { key: "label", label: "Label", type: "string", required: true },
          { key: "url", label: "URL", type: "link" },
        ],
      },
    ] satisfies FieldSchema[];

    const draft = createFrontmatterDraft(nestedFields, {
      seo: { title: " Home ", noindex: true },
      items: [
        {
          label: "Docs",
          url: { type: "external", url: "docs.example.com" },
        },
      ],
    });

    expect(draft.seo).toEqual({ title: " Home ", noindex: true });
    expect(draft.items).toEqual([
      {
        label: "Docs",
        url: {
          type: "external",
          url: "docs.example.com",
          pageId: "",
          entryId: "",
          collectionId: "",
          slug: "",
          label: "",
          openInNewTab: false,
        },
      },
    ]);

    expect(buildFrontmatterFromDraft(nestedFields, draft)).toEqual({
      seo: { title: "Home", noindex: true },
      items: [
        {
          label: "Docs",
          url: { type: "external", url: "https://docs.example.com" },
        },
      ],
    });
  });

  it("preserves repeater item order during serialization", () => {
    const repeaterFields = [
      {
        key: "items",
        label: "Items",
        type: "repeater",
        fields: [{ key: "label", label: "Label", type: "string" }],
      },
    ] satisfies FieldSchema[];

    expect(
      buildFrontmatterFromDraft(repeaterFields, {
        items: [{ label: "Second" }, { label: "First" }],
      }),
    ).toEqual({
      items: [{ label: "Second" }, { label: "First" }],
    });
  });

  it("preserves required internal links in nested repeater items", () => {
    const navFields = [
      {
        key: "items",
        label: "Menu items",
        type: "repeater",
        required: true,
        fields: [
          { key: "label", label: "Label", type: "string", required: true },
          { key: "link", label: "Link", type: "link", required: true },
          {
            key: "openInNewTab",
            label: "Open in new tab",
            type: "boolean",
            default: false,
          },
        ],
      },
    ] satisfies FieldSchema[];

    const draft = createFrontmatterDraft(navFields, {
      items: [
        {
          label: "About",
          link: { type: "internal", url: "/about", label: "About" },
          openInNewTab: false,
        },
      ],
    });

    expect(draft.items).toEqual([
      {
        label: "About",
        link: {
          type: "internal",
          url: "/about",
          pageId: "",
          entryId: "",
          collectionId: "",
          slug: "",
          label: "About",
          openInNewTab: false,
        },
        openInNewTab: false,
      },
    ]);

    expect(buildFrontmatterFromDraft(navFields, draft)).toEqual({
      items: [
        {
          label: "About",
          link: { type: "internal", url: "/about", label: "About" },
          openInNewTab: false,
        },
      ],
    });
  });

  it("clones repeater items and resolves stable item titles", () => {
    const item = {
      label: "Docs",
      link: { type: "external", url: "https://example.test" },
    };
    const cloned = cloneCmsRepeaterItemDraft(item);

    expect(cloned).toEqual(item);
    expect(cloned).not.toBe(item);
    expect(cloned.link).not.toBe(item.link);
    expect(
      resolveCmsRepeaterItemTitle(
        [
          { key: "link", label: "Link", type: "link" },
          { key: "label", label: "Label", type: "string" },
        ],
        item,
        0,
      ),
    ).toBe("Docs");
    expect(resolveCmsRepeaterItemTitle([], {}, 2)).toBe("Item 3");
  });

  it("uses configured repeater title fields before inferred labels", () => {
    expect(
      resolveCmsRepeaterItemTitle(
        [
          { key: "label", label: "Label", type: "string" },
          { key: "heading", label: "Heading", type: "string" },
        ],
        {
          label: "Fallback label",
          heading: "Configured heading",
        },
        0,
        "heading",
      ),
    ).toBe("Configured heading");

    expect(
      resolveCmsRepeaterItemTitle(
        [
          { key: "label", label: "Label", type: "string" },
          { key: "heading", label: "Heading", type: "string" },
        ],
        {
          label: "Fallback label",
          heading: "",
        },
        0,
        "heading",
      ),
    ).toBe("Item 1");
  });
});
