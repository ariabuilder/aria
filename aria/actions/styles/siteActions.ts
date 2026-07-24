import { defineAction, ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../../lib/content-sync/mutations";
import { type StylesData } from "../../lib/types/classes";
import {
  createStylesDataSnapshotFromUniversalDesignSystem,
  normalizeStylesDataToUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import { requireAuth, resolveAuthorizedMutation } from "../_shared";
import { getRenderStylesAction } from "./renderStyles";
import { StylesUpdateSchema } from "./schemas";
import {
  buildStoredRenderStylesData,
  ensureNavigationPresetClassesForAdapter,
  regenerateGlobalCSSArtifacts,
  safelyRefreshStyleArtifactsAfterMutation,
} from "./globalCssArtifacts";
import {
  endPerformanceTracking,
  getDesignSystem,
  log,
  saveDesignSystem,
  startPerformanceTracking,
} from "./_shared";

function createLegacyStylesSnapshot(
  designSystem: UniversalDesignSystem,
): StylesData {
  return createStylesDataSnapshotFromUniversalDesignSystem(designSystem);
}

// Legacy compatibility bridge for callers that still send partial StylesData
// updates instead of writing directly to the universal design-system model.
function applyLegacyStylesUpdate(
  currentDesignSystem: UniversalDesignSystem,
  input: z.infer<typeof StylesUpdateSchema>,
): UniversalDesignSystem {
  const currentStyles = createLegacyStylesSnapshot(currentDesignSystem);
  const updatedStyles = {
    ...currentStyles,
    ...input,
  } as StylesData;

  return normalizeStylesDataToUniversalDesignSystem(updatedStyles);
}

export async function handleRegenerateGlobalCSS(
  _input: void,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.regenerateGlobalCSS",
    "save-styles",
  );

  const operation = "regenerateGlobalCSS";
  startPerformanceTracking(operation);

  try {
    log("info", "Starting global CSS regeneration");

    const adapter = await getStorageAdapterAsync(context.locals);

    const result = await regenerateGlobalCSSArtifacts(adapter, {
      bumpStyleRevision: true,
      invalidatePageRenderArtifacts: true,
      authorship,
    });

    const duration = endPerformanceTracking(operation);
    log("info", "Global CSS regeneration complete", {
      framework: result.framework,
      cssSize: `${(result.cssSize / 1024).toFixed(2)}KB`,
      classCount: result.classCount,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      data: {
        globalCSSHash: result.globalCSSHash,
        cssSize: result.cssSize,
        classCount: result.classCount,
        lastCompiled: result.lastCompiled,
        framework: result.framework,
        styleRevision: result.styleRevision,
        invalidatedPageCount: result.invalidatedPageCount,
      },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "CSS regeneration failed", { error });
    return {
      success: false,
      error: {
        code: "CSS_REGENERATION_FAILED",
        message:
          error instanceof Error ? error.message : "CSS regeneration failed",
      },
    };
  }
}

export const siteStyleActions = {
  get: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const operation = "getStyles";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const stylesData = createLegacyStylesSnapshot(designSystem);

        const duration = endPerformanceTracking(operation);
        log("info", "Styles loaded", {
          customClasses: Object.keys(designSystem.semanticClasses).length,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: stylesData,
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to get styles", { error });
        return {
          success: false,
          error: {
            code: "GET_STYLES_FAILED",
            message:
              error instanceof Error ? error.message : "Failed to get styles",
          },
        };
      }
    },
  }),

  /**
   * Update styles data
   *
   * Legacy compatibility action that accepts partial pre-universal StylesData
   * fields and converts them into the canonical universal design system.
   *
   * @param tokens - Design tokens
   * @param classes - Legacy custom classes
   * @param customClasses - New format custom classes with metadata
   * @param customFonts - Custom fonts library
   * @param cssVariables - CSS custom properties
   * @returns Updated styles
   */

  update: defineAction({
    accept: "json",
    input: StylesUpdateSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.update",
        "save-styles",
      );

      const operation = "updateStyles";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        const currentDesignSystem = await getDesignSystem(adapter);
        const updatedDesignSystem = applyLegacyStylesUpdate(
          currentDesignSystem,
          input,
        );

        await saveDesignSystem(adapter, updatedDesignSystem, authorship);
        await safelyRefreshStyleArtifactsAfterMutation(
          adapter,
          "default",
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: "default",
          },
          context,
        );

        const duration = endPerformanceTracking(operation);
        log("info", "Legacy styles bridge updated canonical design system", {
          customClasses: Object.keys(updatedDesignSystem.semanticClasses)
            .length,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: createLegacyStylesSnapshot(updatedDesignSystem),
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update styles", { error });
        return {
          success: false,
          error: {
            code: "UPDATE_STYLES_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update styles",
          },
        };
      }
    },
  }),

  /**
   * Get global CSS
   *
   * Returns compiled global CSS and metadata for cache checking.
   *
   * @returns Global CSS data with hash and metadata
   */

  getGlobalCSS: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const operation = "getGlobalCSS";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const [siteSettings, designSystem] = await Promise.all([
          adapter.getSiteSettings(),
          getDesignSystem(adapter),
        ]);
        const renderStyles = buildStoredRenderStylesData(
          designSystem,
          siteSettings,
        );

        void endPerformanceTracking(operation);

        if (!renderStyles.globalCSS) {
          return {
            success: false,
            error: {
              code: "NO_CSS",
              message: "No global CSS generated yet",
            },
          };
        }

        return {
          success: true,
          data: {
            globalCSS: renderStyles.globalCSS,
            globalCSSHash: renderStyles.globalCSSHash,
            lastCompiled: renderStyles.lastCompiled,
            cssSize: renderStyles.globalCSS.length,
          },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to get global CSS", { error });
        return {
          success: false,
          error: {
            code: "GET_GLOBAL_CSS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get global CSS",
          },
        };
      }
    },
  }),

  getRenderStyles: getRenderStylesAction,

  regenerateGlobalCSS: defineAction({
    accept: "json",
    handler: handleRegenerateGlobalCSS,
  }),

  ensureNavigationPresetClasses: defineAction({
    accept: "json",
    input: z.object({}).optional(),
    handler: async (_, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.createClass",
        "save-styles",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      return ensureNavigationPresetClassesForAdapter(adapter, authorship);
    },
  }),
};
