/**
 * Styles action compatibility index. Implementations are organized by
 * render caching, global CSS artifacts, and custom-class mutations.
 */

import { classStyleActions } from "./styles/classActions";
import { siteStyleActions } from "./styles/siteActions";

export type {
  BuildGlobalCSSArtifactsOptions,
  RegenerateGlobalCSSArtifactsOptions,
} from "./styles/globalCssArtifacts";
export {
  buildGeneratedDocumentCss,
  buildGlobalCSSArtifactsSnapshot,
  buildStageRenderStylesData,
  buildStoredRenderStylesData,
  ensureNavigationPresetClassesForAdapter,
  regenerateGlobalCSSArtifacts,
} from "./styles/globalCssArtifacts";
export {
  buildRenderStylesCacheKey,
  buildRenderStylesContentSignature,
} from "./styles/renderStyles";
export {
  handleCreateClass,
  handleDeleteClass,
  handleDuplicateClass,
  handleRemoveClassRule,
  handleRenameClass,
  handleReplaceClassStyles,
  handleReplaceClassVariantRules,
  handleUpdateClassRule,
} from "./styles/classMutations";
export { handleRegenerateGlobalCSS } from "./styles/siteActions";

export const styles = {
  ...siteStyleActions,
  ...classStyleActions,
};
