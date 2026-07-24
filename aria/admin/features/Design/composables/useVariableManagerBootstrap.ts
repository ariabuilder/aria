import { ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";

import { log } from "@/lib/utils/logger";
import {
  unwrapGlobalStylesActionResult,
  VariableManagerBootstrapSuccessSchema,
} from "./globalStylesActionResults";
import { useGlobalStyles } from "./useGlobalStyles";
import { useDesignSystem } from "./useDesignSystem";

const isVariablesLoading = ref(false);
const isTokenInventoryLoading = ref(false);
let bootstrapPromise: Promise<void> | null = null;

export function useVariableManagerBootstrap() {
  const {
    hasLoaded,
    isLoading: isGlobalStylesLoading,
    hydrateGlobalStyles,
    loadGlobalStyles,
  } = useGlobalStyles();
  const {
    palettes,
    isLoading: isDesignSystemLoading,
    applyImportedColors,
    load: loadDesignSystem,
  } = useDesignSystem();

  async function loadVariableManagerBootstrap(
    force = false,
    options: { silent?: boolean } = {},
  ): Promise<void> {
    const needsVariables = force || !hasLoaded.value;
    const needsTokens = force || palettes.value.length === 0;

    if (!needsVariables && !needsTokens) {
      return;
    }

    if (bootstrapPromise && !force) {
      return bootstrapPromise;
    }

    if (needsVariables) {
      isVariablesLoading.value = true;
    }
    if (needsTokens) {
      isTokenInventoryLoading.value = true;
    }

    bootstrapPromise = (async () => {
      let variablesWereLoading = needsVariables;
      let tokensWereLoading = needsTokens;

      try {
        const stillNeedsVariables = force || !hasLoaded.value;
        const stillNeedsTokens = force || palettes.value.length === 0;

        if (!stillNeedsVariables && !stillNeedsTokens) {
          return;
        }

        variablesWereLoading = stillNeedsVariables;
        tokensWereLoading = stillNeedsTokens;

        if (stillNeedsVariables && stillNeedsTokens) {
          const preloadInFlight =
            isGlobalStylesLoading.value || isDesignSystemLoading.value;

          if (preloadInFlight) {
            await Promise.all([
              loadGlobalStyles(force, options),
              loadDesignSystem(force),
            ]);
            return;
          }

          const result = unwrapGlobalStylesActionResult(
            await actions.designSystem.getVariableManagerBootstrap({}),
            VariableManagerBootstrapSuccessSchema,
            "Failed to load variable manager data",
            {
              source: "useVariableManagerBootstrap.loadVariableManagerBootstrap",
            },
          );

          if (!result.success) {
            throw new Error(result.error);
          }

          hydrateGlobalStyles(result.data.data.globalStyles);
          applyImportedColors(result.data.data.colors);
          return;
        }

        if (stillNeedsVariables) {
          await loadGlobalStyles(force, options);
        }

        if (stillNeedsTokens) {
          await loadDesignSystem(force);
        }
      } catch (error) {
        log("error", "[useVariableManagerBootstrap] Failed to load data", {
          error,
        });
        if (!options.silent) {
          toast.error("Failed to load variables");
        }
      } finally {
        if (variablesWereLoading) {
          isVariablesLoading.value = false;
        }
        if (tokensWereLoading) {
          isTokenInventoryLoading.value = false;
        }
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  }

  return {
    isVariablesLoading,
    isTokenInventoryLoading,
    loadVariableManagerBootstrap,
  };
}
