import { describe, expect, it } from "vitest";

import {
  isNodeListLoopDataSource,
  nextDataSourceAfterDisablingListLoop,
  resolveInspectorPreviewEntryId,
  shouldBootstrapTemplatePageDataSource,
  shouldBootstrapTemplatePageListDataSource,
} from "../../../admin/features/Inspector/composables/usePropsEditor";

describe("template page CMS binding", () => {
  it("prefers the page preview entry on entry template pages", () => {
    expect(
      resolveInspectorPreviewEntryId({
        isEntryTemplatePage: true,
        pagePreviewEntryId: "page-entry-1",
        nodeFilterEntryId: "node-entry-1",
      }),
    ).toBe("page-entry-1");
  });

  it("falls back to the node filter entry when not on an entry template page", () => {
    expect(
      resolveInspectorPreviewEntryId({
        isEntryTemplatePage: false,
        pagePreviewEntryId: "page-entry-1",
        nodeFilterEntryId: "node-entry-1",
      }),
    ).toBe("node-entry-1");
  });

  it("bootstraps template page data source when collection is not assigned yet", () => {
    expect(
      shouldBootstrapTemplatePageDataSource({
        isAssignedCmsTemplatePage: true,
        assignedCollectionName: "blog",
        existingCollectionName: undefined,
      }),
    ).toBe(true);
  });

  it("does not bootstrap when the node already has a collection", () => {
    expect(
      shouldBootstrapTemplatePageDataSource({
        isAssignedCmsTemplatePage: true,
        assignedCollectionName: "blog",
        existingCollectionName: "blog",
      }),
    ).toBe(false);
  });

  it("does not bootstrap on non-template pages", () => {
    expect(
      shouldBootstrapTemplatePageDataSource({
        isAssignedCmsTemplatePage: false,
        assignedCollectionName: "blog",
        existingCollectionName: undefined,
      }),
    ).toBe(false);
  });
});

describe("template page list loop bootstrap", () => {
  it("bootstraps list data source on list template repeat-capable nodes", () => {
    expect(
      shouldBootstrapTemplatePageListDataSource({
        isListTemplatePage: true,
        isRepeatCapable: true,
        assignedCollectionName: "blog",
        existingCollectionName: undefined,
      }),
    ).toBe(true);
  });

  it("does not bootstrap when the node already has a collection", () => {
    expect(
      shouldBootstrapTemplatePageListDataSource({
        isListTemplatePage: true,
        isRepeatCapable: true,
        assignedCollectionName: "blog",
        existingCollectionName: "blog",
      }),
    ).toBe(false);
  });

  it("does not bootstrap on entry template pages", () => {
    expect(
      shouldBootstrapTemplatePageListDataSource({
        isListTemplatePage: false,
        isRepeatCapable: true,
        assignedCollectionName: "blog",
        existingCollectionName: undefined,
      }),
    ).toBe(false);
  });

  it("does not bootstrap on non-repeat-capable nodes", () => {
    expect(
      shouldBootstrapTemplatePageListDataSource({
        isListTemplatePage: true,
        isRepeatCapable: false,
        assignedCollectionName: "blog",
        existingCollectionName: undefined,
      }),
    ).toBe(false);
  });
});

describe("disable list loop data source", () => {
  it("clears list-only data sources entirely", () => {
    expect(
      nextDataSourceAfterDisablingListLoop({
        type: "collection",
        collection: "blog",
        mode: "list",
        sort: "-publishedAt",
        limit: 12,
      }),
    ).toBeNull();
  });

  it("keeps field bindings when disabling list loop", () => {
    expect(
      nextDataSourceAfterDisablingListLoop({
        type: "collection",
        collection: "blog",
        mode: "list",
        sort: "-publishedAt",
        limit: 12,
        bindings: {
          text: "title",
        },
      }),
    ).toEqual({
      type: "collection",
      collection: "blog",
      mode: "single",
      bindings: {
        text: "title",
      },
    });
  });

  it("detects active list loop data sources", () => {
    expect(
      isNodeListLoopDataSource({
        type: "collection",
        collection: "blog",
        mode: "list",
      }),
    ).toBe(true);
    expect(
      isNodeListLoopDataSource({
        type: "collection",
        collection: "blog",
        mode: "single",
      }),
    ).toBe(false);
  });
});
