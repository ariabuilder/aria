import { describe, expect, it } from "vitest";
import {
  CAPABILITY_OPERATIONS,
  getCapabilitiesForOperation,
  OperationIdSchema,
} from "../../../lib/auth/capabilityOperations";

/** Astro action operations (mutations + gated reads). Public handlers exempt. */
const PHASE_6_OPERATION_IDS = [
  "save.page",
  "save.layout",
  "save.component",
  "crud.getItem",
  "crud.createItem",
  "crud.updateItem",
  "crud.deleteItem",
  "crud.duplicateItem",
  "nodes.mutate",
  "nodes.insertNode",
  "nodes.insertNodes",
  "nodes.deleteNode",
  "nodes.replaceNode",
  "nodes.moveNode",
  "nodes.updateClassNames",
  "nodes.addUtilityClass",
  "nodes.removeUtilityClass",
  "nodes.updateCustomClasses",
  "nodes.addCustomClass",
  "nodes.removeCustomClass",
  "pages.listInventory",
  "pages.getPolicy",
  "pages.updatePolicy",
  "pages.updateSeo",
  "pages.getMeta",
  "pages.bulkUpdate",
  "pages.reorderSections",
  "pages.getVersions",
  "pages.getVersionSnapshot",
  "pages.revertVersion",
  "pages.deleteVersion",
  "pages.cover",
  "pages.removeCover",
  "pages.getPageActivity",
  "pages.getPageMedia",
  "ordering.updateOrder",
  "library.installPack",
  "library.installComponent",
  "library.installStarterButton",
  "library.uninstallPack",
  "publishing.publish",
  "publishing.batchPublish",
  "publishing.unpublish",
  "publishing.archive",
  "publishing.unarchive",
  "publishing.snapshot",
] as const;

/** Intentionally ungated (public / low-sensitivity). */
const PHASE_6_PUBLIC_EXEMPT = ["pages.verifyAccessPassword"] as const;

/** Astro action operations (design system, styles, settings mutations). */
const PHASE_7_OPERATION_IDS = [
  "designSystem.saveColors",
  "designSystem.saveTypography",
  "designSystem.saveGlobalStyles",
  "designSystem.saveBreakpoints",
  "designSystem.applyTemplate",
  "designSystem.import",
  "designSystem.importBundle",
  "designSystem.export",
  "styles.update",
  "styles.createClass",
  "styles.updateClassRule",
  "styles.deleteClass",
  "styles.deleteClasses",
  "styles.renameClass",
  "styles.duplicateClass",
  "styles.setAuthoringMode",
  "styles.setFrameworkMode",
  "styles.bulkImportClasses",
  "styles.removeClassRule",
  "styles.updateClassPseudoRule",
  "styles.removeClassPseudoRule",
  "styles.updateClassUsage",
  "styles.regenerateGlobalCSS",
  "fonts.uploadCustom",
  "fonts.deleteCustom",
  "fonts.renameCustom",
  "fonts.enableGoogle",
  "fonts.disableGoogle",
  "fonts.updateGoogleVariants",
  "settings.update",
  "settings.updateAppearance",
  "settings.updateIcons",
  "settings.reset",
  "settings.updateComponentGrouping",
  "settings.updateMediaGrouping",
] as const;

/** Studio traffic metrics (Cloudflare zone GraphQL). */
const STUDIO_METRICS_OPERATION_IDS = [
  "analytics.getMetricsAvailability",
  "analytics.getSiteTraffic",
  "analytics.getPagesTraffic",
  "analytics.getPageTraffic",
] as const;

/** Astro action operations (media authorship + sync/export gates). */
const PHASE_8_OPERATION_IDS = [
  "media.list",
  "media.usages",
  "media.upload",
  "media.replaceSource",
  "media.rename",
  "media.duplicate",
  "media.delete",
  "media.rebuildUsageIndex",
  "media.sync.plan",
  "media.sync.apply",
  "media.sync.history",
  "contentSync.plan",
  "contentSync.apply",
  "contentSync.status",
  "contentSync.history",
  "importExport.list",
  "importExport.exportItem",
  "importExport.exportAll",
  "siteExport.create",
  "siteExport.list",
  "siteExport.getLatest",
  "siteExport.delete",
] as const;

/** Agent capability matrix coverage. */
const AGENT_OPERATION_IDS = [
  "agent.getAvailability",
  "agent.getChatHistory",
  "agent.chat",
  "agent.clearChat",
  "agent.listWorkersAiModels",
  "agent.listOpencodeModels",
  "agent.listOpenAiModels",
  "agent.listAnthropicModels",
  "agent.listGoogleModels",
  "agent.listOpenRouterModels",
  "agent.confirmAction",
  "agent.createMcpTokenPersonal",
  "agent.listPersonalMcpTokens",
  "agent.revokePersonalMcpToken",
  "agent.updatePersonalMcpToken",
  "agent.createMcpToken",
  "agent.listMcpTokens",
  "agent.revokeMcpToken",
  "agent.updateMcpToken",
  "settings.updateAgent",
  "settings.updateAgentProvider",
  "settings.removeAgentProvider",
  "settings.removeInferenceProvider",
] as const;

describe("Agent capability matrix coverage", () => {
  it("maps every agent operation to at least one capability", () => {
    for (const operationId of AGENT_OPERATION_IDS) {
      OperationIdSchema.parse(operationId);
      const capabilities = getCapabilitiesForOperation(operationId);
      expect(capabilities.length).toBeGreaterThan(0);
    }
  });

  it("routes chat to useStudioAgent", () => {
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain("agent.chat");
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain(
      "agent.getChatHistory",
    );
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain("agent.clearChat");
  });

  it("routes action confirmation to useStudioAgent", () => {
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain(
      "agent.confirmAction",
    );
  });

  it("routes provider updates to editAgentSettings", () => {
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "settings.updateAgentProvider",
    );
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "settings.removeAgentProvider",
    );
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "settings.removeInferenceProvider",
    );
  });

  it("routes agent listActivityLog to editAgentSettings", () => {
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "agent.listActivityLog",
    );
  });

  it("routes personal MCP token operations to useStudioAgent only", () => {
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain(
      "agent.listPersonalMcpTokens",
    );
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain(
      "agent.revokePersonalMcpToken",
    );
    expect(CAPABILITY_OPERATIONS.useStudioAgent).toContain(
      "agent.updatePersonalMcpToken",
    );
    expect(CAPABILITY_OPERATIONS.useStudioAgent).not.toContain(
      "agent.listMcpTokens",
    );
    expect(CAPABILITY_OPERATIONS.useStudioAgent).not.toContain(
      "agent.revokeMcpToken",
    );
    expect(CAPABILITY_OPERATIONS.useStudioAgent).not.toContain(
      "agent.updateMcpToken",
    );
  });

  it("routes global MCP token operations to editAgentSettings", () => {
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "agent.listMcpTokens",
    );
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "agent.revokeMcpToken",
    );
    expect(CAPABILITY_OPERATIONS.editAgentSettings).toContain(
      "agent.updateMcpToken",
    );
  });
});

describe("Studio metrics capability matrix coverage", () => {
  it("maps every analytics operation to at least one capability", () => {
    for (const operationId of STUDIO_METRICS_OPERATION_IDS) {
      OperationIdSchema.parse(operationId);
      const capabilities = getCapabilitiesForOperation(operationId);
      expect(capabilities.length).toBeGreaterThan(0);
    }
  });

  it("maps getMetricsAvailability to viewStudioMetrics and editAnalytics", () => {
    const caps = getCapabilitiesForOperation(
      "analytics.getMetricsAvailability",
    );
    expect(caps).toContain("viewStudioMetrics");
    expect(caps).toContain("editAnalytics");
  });

  it("maps traffic data operations to viewStudioMetrics only", () => {
    for (const operationId of [
      "analytics.getSiteTraffic",
      "analytics.getPagesTraffic",
      "analytics.getPageTraffic",
    ] as const) {
      expect(getCapabilitiesForOperation(operationId)).toEqual([
        "viewStudioMetrics",
      ]);
    }
  });
});

describe("Phase 8 capability matrix coverage", () => {
  it("maps every Phase 8 gated operation to at least one capability", () => {
    for (const operationId of PHASE_8_OPERATION_IDS) {
      OperationIdSchema.parse(operationId);
      const capabilities = getCapabilitiesForOperation(operationId);
      expect(capabilities.length).toBeGreaterThan(0);
    }
  });

  it("routes content sync status and history to syncMedia", () => {
    expect(CAPABILITY_OPERATIONS.syncMedia).toContain("contentSync.status");
    expect(CAPABILITY_OPERATIONS.syncMedia).toContain("contentSync.history");
  });
});

describe("Phase 7 capability matrix coverage", () => {
  it("maps every Phase 7 gated operation to at least one capability", () => {
    for (const operationId of PHASE_7_OPERATION_IDS) {
      OperationIdSchema.parse(operationId);
      const capabilities = getCapabilitiesForOperation(operationId);
      expect(capabilities.length).toBeGreaterThan(0);
    }
  });

  it("routes designSystem.export to manageExports not editSiteSettings", () => {
    expect(CAPABILITY_OPERATIONS.manageExports).toContain(
      "designSystem.export",
    );
    expect(CAPABILITY_OPERATIONS.editSiteSettings).not.toContain(
      "designSystem.export",
    );
  });

  it("routes WordPress import operations to manageExports", () => {
    expect(CAPABILITY_OPERATIONS.manageExports).toContain(
      "wordpressImport.upload",
    );
    expect(CAPABILITY_OPERATIONS.manageExports).toContain(
      "wordpressImport.apply",
    );
    expect(CAPABILITY_OPERATIONS.manageExports).toContain(
      "wordpressImport.cleanupExpiredFiles",
    );
    expect(CAPABILITY_OPERATIONS.editCms).not.toContain(
      "wordpressImport.upload",
    );
  });

  it("allows settings.updateAppearance via editStudioPreferences", () => {
    expect(CAPABILITY_OPERATIONS.editStudioPreferences).toContain(
      "settings.updateAppearance",
    );
    expect(CAPABILITY_OPERATIONS.editSiteSettings).toContain(
      "settings.updateAppearance",
    );
  });
});

describe("Phase 6 capability matrix coverage", () => {
  it("maps every Phase 6 gated operation to at least one capability", () => {
    for (const operationId of PHASE_6_OPERATION_IDS) {
      OperationIdSchema.parse(operationId);
      const capabilities = getCapabilitiesForOperation(operationId);
      expect(capabilities.length).toBeGreaterThan(0);
    }
  });

  it("does not list pages.updatePolicy under editPages (security)", () => {
    expect(CAPABILITY_OPERATIONS.editPages).not.toContain("pages.updatePolicy");
    expect(CAPABILITY_OPERATIONS.manageSecurity).toContain(
      "pages.updatePolicy",
    );
    expect(CAPABILITY_OPERATIONS.manageSecurity).toContain("pages.getPolicy");
  });

  it("routes media.delete to editPages not uploadMedia", () => {
    expect(CAPABILITY_OPERATIONS.uploadMedia).not.toContain("media.delete");
    expect(CAPABILITY_OPERATIONS.editPages).toContain("media.delete");
  });

  it("routes pages.revertVersion to editPageStructure not editPageContent", () => {
    expect(CAPABILITY_OPERATIONS.editPageStructure).toContain(
      "pages.revertVersion",
    );
    expect(CAPABILITY_OPERATIONS.editPageContent).not.toContain(
      "pages.revertVersion",
    );
  });

  it("routes pages.deleteVersion to editPageStructure not editPageContent", () => {
    expect(CAPABILITY_OPERATIONS.editPageStructure).toContain(
      "pages.deleteVersion",
    );
    expect(CAPABILITY_OPERATIONS.editPageContent).not.toContain(
      "pages.deleteVersion",
    );
  });

  it("documents public exempt operations separately from matrix gating", () => {
    for (const operationId of PHASE_6_PUBLIC_EXEMPT) {
      OperationIdSchema.parse(operationId);
      expect(getCapabilitiesForOperation(operationId).length).toBeGreaterThan(
        0,
      );
    }
  });
});
