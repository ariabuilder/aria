/**
 * Orchestrates all action modules All implementation lives in aria/actions/* modules.
 */

import { defineAction } from "astro:actions";

// Import all domain-specific action modules
import { auth } from "../../aria/actions/auth";
import { media } from "../../aria/actions/media";
import { onboarding } from "../../aria/actions/onboarding";
import { deployments } from "../../aria/actions/deployments";
import { storage } from "../../aria/actions/storage";
import { cache } from "../../aria/actions/cache";
import { importExport } from "../../aria/actions/import-export";
import { publishing } from "../../aria/actions/publishing";
import { designSystem } from "../../aria/actions/design-system";
import { styles } from "../../aria/actions/styles";
import { discovery } from "../../aria/actions/discovery";
import { redirects } from "../../aria/actions/redirects";
import { cms } from "../../aria/actions/cms";
import { settings } from "../../aria/actions/settings";
import { pages } from "../../aria/actions/pages";
import { crud } from "../../aria/actions/crud";
import { nodes } from "../../aria/actions/nodes";
import { save } from "../../aria/actions/save";
import { core } from "../../aria/actions/core";
import { layouts } from "../../aria/actions/layouts";
import { ordering } from "../../aria/actions/ordering";
import { fonts } from "../../aria/actions/fonts";
import { library } from "../../aria/actions/library";
import { components } from "../../aria/actions/components";
import { platform } from "../../aria/actions/platform";
import { analytics } from "../../aria/actions/analytics";
import { contentSync } from "../../aria/actions/content-sync";
import { email } from "../../aria/actions/email";
import { siteExport } from "../../aria/actions/site-export";
import { wordpressImport } from "../../aria/actions/wordpress-import";
import { localization } from "../../aria/actions/localization";
import { apiTokens } from "../../aria/actions/apiTokens";
import { webhooks } from "../../aria/actions/webhooks";
import { oauth } from "../../aria/actions/oauth";
import { agentActions } from "../../aria/admin/features/Agent/actions";
import { log } from "../../aria/actions/_shared";

export const server = {
  auth,

  media,
  onboarding,
  deployments,
  storage,
  cache,
  importExport,
  publishing,
  designSystem,
  styles,
  settings,
  discovery,
  redirects,
  cms,
  pages,
  fonts,
  ordering,
  library,
  components,
  contentSync,
  email,
  siteExport,
  wordpressImport,
  localization,
  apiTokens,
  webhooks,
  oauth,

  // Platform identity & metrics
  platform,
  analytics,
  agent: agentActions,

  crud,
  nodes,
  save,
  core,
  layouts,

  // Backwards compatibility: Re-export core actions at root level
  init: core.init,
  compose: core.compose,

  // Backwards compatibility: Re-export CRUD actions at root level
  getItem: crud.getItem,
  createItem: crud.createItem,
  updateItem: crud.updateItem,
  deleteItem: crud.deleteItem,
  duplicateItem: crud.duplicateItem,

  // Backwards compatibility: Re-export node actions at root level
  mutate: nodes.mutate,
  mutateBatch: nodes.mutateBatch,
  insertNode: nodes.insertNode,
  insertNodes: nodes.insertNodes,
  deleteNode: nodes.deleteNode,
  deleteNodes: nodes.deleteNodes,
  replaceNode: nodes.replaceNode,
  moveNode: nodes.moveNode,

  // Backwards compatibility: Re-export save actions at root level
  savePage: save.page,
  saveComponent: save.component,
  saveLayout: save.layout,

  // Backwards compatibility: Re-export ordering at root level
  updateOrder: ordering.updateOrder,

  /**
   * Dev restart action (no-op in production)
   *
   * This is used in development to restart the dev server.
   * In production, this is a no-op.
   */
  devRestart: defineAction({
    accept: "json",
    handler: async () => {
      if (import.meta.env.PROD) {
        log("debug", "devRestart called in production (no-op)", undefined);
      }
      return { success: true };
    },
  }),
};
