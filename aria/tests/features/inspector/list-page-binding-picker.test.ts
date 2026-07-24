import { describe, expect, it } from "vitest";

import {
  resolveBindingPickerMode,
  resolveInspectorBindingPickerInitialPage,
} from "../../../admin/features/Inspector/composables/useInspectorPropBinding";
import { shouldAutoScopePageAssignedCollection } from "../../../admin/features/Inspector/composables/usePropsEditor";

describe("resolveBindingPickerMode", () => {
  it("uses multi-step on list template pages outside a loop", () => {
    expect(
      resolveBindingPickerMode({
        isListTemplatePage: true,
        hasInheritedCmsLoopSource: false,
      }),
    ).toBe("multi-step");
  });

  it("keeps fast-fields inside an inherited loop on list pages", () => {
    expect(
      resolveBindingPickerMode({
        isListTemplatePage: true,
        hasInheritedCmsLoopSource: true,
      }),
    ).toBe("fast-fields");
  });

  it("keeps fast-fields on entry template pages", () => {
    expect(
      resolveBindingPickerMode({
        isListTemplatePage: false,
        hasInheritedCmsLoopSource: false,
      }),
    ).toBe("fast-fields");
  });

  it("uses fast-fields for list-loop containers on list template pages", () => {
    expect(
      resolveBindingPickerMode({
        isListTemplatePage: true,
        hasInheritedCmsLoopSource: false,
        isListLoopContainer: true,
      }),
    ).toBe("fast-fields");
  });
});

describe("resolveInspectorBindingPickerInitialPage", () => {
  it("starts at collection when no collection is selected", () => {
    expect(
      resolveInspectorBindingPickerInitialPage({
        hasSelectedCollection: false,
        hasSelectedEntry: false,
      }),
    ).toBe("collection");
  });

  it("starts at entry when collection is selected but entry is not", () => {
    expect(
      resolveInspectorBindingPickerInitialPage({
        hasSelectedCollection: true,
        hasSelectedEntry: false,
      }),
    ).toBe("entry");
  });

  it("starts at field when collection and entry are selected", () => {
    expect(
      resolveInspectorBindingPickerInitialPage({
        hasSelectedCollection: true,
        hasSelectedEntry: true,
      }),
    ).toBe("field");
  });
});

describe("shouldAutoScopePageAssignedCollection", () => {
  it("does not auto-scope page collection on list pages outside loops", () => {
    expect(
      shouldAutoScopePageAssignedCollection({
        isListTemplatePage: true,
        hasInheritedCmsLoopSource: false,
        nodeDataSourceCollection: undefined,
      }),
    ).toBe(false);
  });

  it("auto-scopes when the node already has a collection", () => {
    expect(
      shouldAutoScopePageAssignedCollection({
        isListTemplatePage: true,
        hasInheritedCmsLoopSource: false,
        nodeDataSourceCollection: "blog",
      }),
    ).toBe(true);
  });

  it("auto-scopes when inside an inherited loop", () => {
    expect(
      shouldAutoScopePageAssignedCollection({
        isListTemplatePage: true,
        hasInheritedCmsLoopSource: true,
        nodeDataSourceCollection: undefined,
      }),
    ).toBe(true);
  });

  it("auto-scopes on entry template pages", () => {
    expect(
      shouldAutoScopePageAssignedCollection({
        isListTemplatePage: false,
        hasInheritedCmsLoopSource: false,
        nodeDataSourceCollection: undefined,
      }),
    ).toBe(true);
  });
});
