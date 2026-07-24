import { describe, expect, it } from "vitest";

import {
  buildCollectionsByKey,
  createCmsBindingFieldOptionGroups,
  createSchemaFieldOptions,
  createSystemFieldOptions,
  isRepeatCapableInspectorNodeType,
  isVisibleInspectorBindingProp,
  shouldAddSyntheticRepeatBindingProp,
  shouldAddSyntheticTextBindingProp,
  type CmsBindingFieldOption,
  type PropertyDefinition,
} from "../../../admin/features/Inspector/composables/usePropsEditor";
import {
  isDateBindingFieldType,
  resolveCmsBindingFieldType,
} from "../../../lib/cms/dateBindingFormats";
import type { AriaCollection, FieldSchema } from "../../../lib/cms/schemas";
import { entryFieldsForCollection } from "../../../lib/cms/systemFields";

const options = [
  {
    label: "Title",
    path: "blog.title",
    type: "system",
    source: "system",
    depth: 0,
    isList: false,
  },
  {
    label: "Cover",
    path: "blog.cover",
    type: "image",
    source: "schema",
    depth: 0,
    isList: false,
  },
  {
    label: "Cover / Alt",
    path: "blog.cover.alt",
    type: "string",
    source: "schema",
    depth: 1,
    isList: false,
  },
  {
    label: "URL",
    path: "blog.url",
    type: "url",
    source: "system",
    depth: 0,
    isList: false,
  },
  {
    label: "Featured",
    path: "blog.featured",
    type: "boolean",
    source: "schema",
    depth: 0,
    isList: false,
  },
  {
    label: "Read time",
    path: "blog.readTime",
    type: "integer",
    source: "schema",
    depth: 0,
    isList: false,
  },
  {
    label: "Menu items",
    path: "nav.items",
    type: "repeater",
    source: "schema",
    depth: 0,
    isList: true,
  },
] satisfies CmsBindingFieldOption[];

function prop(
  name: string,
  type: PropertyDefinition["type"],
): PropertyDefinition {
  return {
    name,
    type,
    value: "",
    isRequired: false,
    studioEditable: true,
    studioHidden: false,
    contentEditorEligible: false,
    contentEditorEnabled: false,
    contentEditorLocked: false,
    contentEditorHidden: false,
    hasSchemaField: false,
  };
}

describe("CMS binding field option groups", () => {
  it("recommends text-compatible fields for string props", () => {
    const groups = createCmsBindingFieldOptionGroups(prop("text", "string"), options);

    expect(groups[0]?.label).toBe("Recommended");
    expect(groups[0]?.options.map((option) => option.path)).toContain("blog.title");
    expect(groups[0]?.options.map((option) => option.path)).not.toContain("blog.cover");
  });

  it("recommends image fields for image-like string props", () => {
    const groups = createCmsBindingFieldOptionGroups(prop("src", "string"), options);

    expect(groups[0]?.options.map((option) => option.path)).toEqual(["blog.cover"]);
  });

  it("recommends image alt subfields for alt props", () => {
    const groups = createCmsBindingFieldOptionGroups(prop("alt", "string"), options);

    expect(groups[0]?.options.map((option) => option.path)).toContain(
      "blog.cover.alt",
    );
    expect(groups[0]?.options.map((option) => option.path)).not.toContain(
      "blog.cover",
    );
  });

  it("recommends generated entry URLs for link props", () => {
    const groups = createCmsBindingFieldOptionGroups(prop("href", "string"), options);

    expect(groups[0]?.options.map((option) => option.path)).toContain("blog.url");
  });

  it("recommends image fields for background image style bindings", () => {
    const groups = createCmsBindingFieldOptionGroups(
      prop("styles.backgroundImage", "string"),
      options,
    );

    expect(groups[0]?.options.map((option) => option.path)).toEqual(["blog.cover"]);
  });

  it("recommends boolean fields for boolean props", () => {
    const groups = createCmsBindingFieldOptionGroups(
      prop("featured", "boolean"),
      options,
    );

    expect(groups[0]?.options.map((option) => option.path)).toEqual([
      "blog.featured",
    ]);
  });

  it("keeps the current binding visible even if it is not recommended", () => {
    const groups = createCmsBindingFieldOptionGroups(
      prop("featured", "boolean"),
      options,
      "blog.title",
    );

    expect(groups[0]?.options.map((option) => option.path)).toEqual([
      "blog.title",
      "blog.featured",
    ]);
  });

  it("recommends repeater fields for array props", () => {
    const groups = createCmsBindingFieldOptionGroups(prop("items", "array"), options);

    expect(groups[0]?.options.map((option) => option.path)).toContain("nav.items");
  });

  it("creates system body options only for body-enabled collections", () => {
    const collection = {
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      kind: "content",
      schema: {
        id: "collection-blog",
        label: "Blog",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: null,
      templatePageId: null,
      listPageId: null,
      supports: ["body"],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    } satisfies AriaCollection;

    expect(createSystemFieldOptions(collection).map((option) => option.path)).toContain(
      "blog.body",
    );
    expect(
      createSystemFieldOptions({ ...collection, supports: [] }).map(
        (option) => option.path,
      ),
    ).not.toContain("blog.body");
  });

  it("creates generated URL options only for routable collections", () => {
    const collection = {
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      kind: "content",
      schema: {
        id: "collection-blog",
        label: "Blog",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/blog/{slug}",
      templatePageId: "page-template",
      listPageId: null,
      supports: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    } satisfies AriaCollection;

    expect(createSystemFieldOptions(collection).map((option) => option.path)).toContain(
      "blog.url",
    );
    expect(
      createSystemFieldOptions({ ...collection, urlPattern: null }).map(
        (option) => option.path,
      ),
    ).not.toContain("blog.url");
  });

  it("creates generated cover binding options for cover-enabled collections", () => {
    const collection = {
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      kind: "data",
      schema: {
        id: "collection-blog",
        label: "Blog",
        kind: "data",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: null,
      templatePageId: null,
      listPageId: null,
      supports: ["cover"],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    } satisfies AriaCollection;

    expect(
      createSchemaFieldOptions(
        collection.name,
        entryFieldsForCollection(collection),
      ).map((option) => option.path),
    ).toContain("blog.cover");
    expect(
      createSchemaFieldOptions(
        collection.name,
        entryFieldsForCollection(collection),
      ).map((option) => option.path),
    ).toEqual(
      expect.arrayContaining([
        "blog.cover.alt",
        "blog.cover.caption",
        "blog.cover.url",
      ]),
    );
    expect(
      createSchemaFieldOptions(
        collection.name,
        entryFieldsForCollection({ ...collection, supports: [] }),
      ).map((option) => option.path),
    ).not.toContain("blog.cover");
  });

  it("creates nested schema binding paths for objects and repeaters", () => {
    const fields = [
      {
        key: "seo",
        label: "SEO",
        type: "object",
        fields: [{ key: "title", label: "Title", type: "string" }],
      },
      {
        key: "items",
        label: "Items",
        type: "repeater",
        fields: [{ key: "label", label: "Label", type: "string" }],
      },
    ] satisfies FieldSchema[];

    const paths = createSchemaFieldOptions("nav", fields).map((option) => ({
      label: option.label,
      path: option.path,
      depth: option.depth,
      isList: option.isList,
    }));

    expect(paths).toContainEqual({
      label: "SEO / Title",
      path: "nav.seo.title",
      depth: 1,
      isList: false,
    });
    expect(paths).toContainEqual({
      label: "Items",
      path: "nav.items",
      depth: 0,
      isList: true,
    });
    expect(paths).toContainEqual({
      label: "Items / First item / Label",
      path: "nav.items.0.label",
      depth: 1,
      isList: false,
    });
  });

  it("creates nested binding paths for reference and relation fields", () => {
    const authors = {
      id: "collection-authors",
      name: "authors",
      label: "Authors",
      kind: "data",
      schema: {
        id: "collection-authors",
        label: "Authors",
        kind: "data",
        fields: [
          { key: "role", label: "Role", type: "string" },
          { key: "avatar", label: "Avatar", type: "image" },
        ],
        version: 1,
      },
      scope: "global",
      urlPattern: null,
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    } satisfies AriaCollection;
    const tags = {
      id: "collection-tags",
      name: "tags",
      label: "Tags",
      kind: "data",
      schema: {
        id: "collection-tags",
        label: "Tags",
        kind: "data",
        fields: [{ key: "color", label: "Color", type: "string" }],
        version: 1,
      },
      scope: "global",
      urlPattern: null,
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    } satisfies AriaCollection;
    const blogFields = [
      {
        key: "author",
        label: "Author",
        type: "reference",
        targetCollection: authors.id,
      },
      {
        key: "tags",
        label: "Tags",
        type: "relation",
        targetCollection: tags.id,
      },
    ] satisfies FieldSchema[];
    const collectionsByKey = buildCollectionsByKey([authors, tags]);
    const paths = createSchemaFieldOptions(
      "blog",
      blogFields,
      "blog",
      "",
      0,
      collectionsByKey,
    ).map((option) => option.path);

    expect(paths).toContain("blog.author");
    expect(paths).toContain("blog.author.title");
    expect(paths).toContain("blog.author.role");
    expect(paths).toContain("blog.author.avatar");
    expect(paths).toContain("blog.tags");
    expect(paths).toContain("blog.tags.0.color");
  });

  it("keeps heading level out of bindable props and adds text when missing", () => {
    expect(isVisibleInspectorBindingProp("level")).toBe(false);
    expect(isVisibleInspectorBindingProp("loading")).toBe(false);
    expect(isVisibleInspectorBindingProp("text")).toBe(true);
    expect(
      shouldAddSyntheticTextBindingProp({
        nodeType: "Heading",
        props: { level: 2 },
      }),
    ).toBe(true);
    expect(
      shouldAddSyntheticTextBindingProp({
        nodeType: "Heading",
        props: { level: 2, text: "Already bindable" },
      }),
    ).toBe(false);
  });

  it("only exposes repeat collection for container-like nodes", () => {
    expect(isRepeatCapableInspectorNodeType("container")).toBe(true);
    expect(isRepeatCapableInspectorNodeType("Section")).toBe(true);
    expect(isRepeatCapableInspectorNodeType("list")).toBe(true);
    expect(isRepeatCapableInspectorNodeType("heading")).toBe(false);
    expect(isRepeatCapableInspectorNodeType("paragraph")).toBe(false);
  });

  it("adds an items binding target for repeat-capable nodes", () => {
    expect(
      shouldAddSyntheticRepeatBindingProp({
        nodeType: "container",
        props: {},
        hasChildren: false,
      }),
    ).toBe(true);
    expect(
      shouldAddSyntheticRepeatBindingProp({
        nodeType: "paragraph",
        props: {},
        hasChildren: true,
      }),
    ).toBe(true);
    expect(
      shouldAddSyntheticRepeatBindingProp({
        nodeType: "container",
        props: { items: [] },
        hasChildren: false,
      }),
    ).toBe(false);
    expect(
      shouldAddSyntheticRepeatBindingProp({
        nodeType: "paragraph",
        props: {},
        hasChildren: false,
      }),
    ).toBe(false);
    expect(
      shouldAddSyntheticRepeatBindingProp({
        nodeType: "navigation",
        props: { sourceMode: "static" },
        hasChildren: true,
      }),
    ).toBe(false);
  });

  it("recognizes CMS date and datetime fields for format binding", () => {
    const publishedAt = options.find((option) => option.path === "blog.title");
    const dateField: CmsBindingFieldOption = {
      label: "Published at",
      path: "blog.publishedAt",
      type: "datetime",
      source: "system",
      depth: 0,
      isList: false,
    };

    expect(isDateBindingFieldType(dateField.type)).toBe(true);
    expect(
      resolveCmsBindingFieldType("blog.publishedAt", [dateField, publishedAt!]),
    ).toBe("datetime");
    expect(
      resolveCmsBindingFieldType("blog.title", [dateField, publishedAt!]),
    ).toBe("system");
  });
});
