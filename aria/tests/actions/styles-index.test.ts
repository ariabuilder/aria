import { describe, expect, it } from "vitest";
import * as styleActions from "../../actions/styles";

const actionNames = [
  "get",
  "update",
  "getGlobalCSS",
  "getRenderStyles",
  "regenerateGlobalCSS",
  "ensureNavigationPresetClasses",
  "getClasses",
  "createClass",
  "updateClassRule",
  "removeClassRule",
  "updateClassPseudoRule",
  "removeClassPseudoRule",
  "deleteClass",
  "deleteClasses",
  "renameClass",
  "duplicateClass",
  "replaceClassStyles",
  "replaceClassVariantRules",
  "updateClassUsage",
  "setAuthoringMode",
  "setFrameworkMode",
  "getGeneratedCSS",
  "bulkImportClasses",
] as const;

const helperNames = [
  "buildRenderStylesCacheKey",
  "buildRenderStylesContentSignature",
  "buildGeneratedDocumentCss",
  "buildStageRenderStylesData",
  "buildStoredRenderStylesData",
  "ensureNavigationPresetClassesForAdapter",
  "buildGlobalCSSArtifactsSnapshot",
  "regenerateGlobalCSSArtifacts",
  "handleCreateClass",
  "handleUpdateClassRule",
  "handleRemoveClassRule",
  "handleDeleteClass",
  "handleRenameClass",
  "handleDuplicateClass",
  "handleReplaceClassStyles",
  "handleReplaceClassVariantRules",
  "handleRegenerateGlobalCSS",
] as const;

describe("styles action compatibility index", () => {
  it("keeps every public action and direct helper export", () => {
    expect(Object.keys(styleActions.styles)).toEqual(actionNames);

    for (const name of actionNames) {
      expect(styleActions.styles[name]).toBeDefined();
    }
    for (const name of helperNames) {
      expect(styleActions[name]).toBeTypeOf("function");
    }
  });
});
