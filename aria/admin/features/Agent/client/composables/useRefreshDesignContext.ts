import { ref } from "vue";
import { actions } from "astro:actions";

/**
 * Debounced design context refresher. After a design mutation (global
 * styles save, CSS regenerate, class create/delete), the client should.
 */

const DEBOUNCE_MS = 300;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolve: (() => void) | null = null;

export function useRefreshDesignContext() {
  /** The last known styleRevision after a successful refresh */
  const lastStyleRevision = ref<string | null>(null);
  /** The full render styles data from the last successful refresh */
  const lastRenderStyles = ref<{
    globalCSSHash: string;
    styleRevision: string;
    lastCompiled: string;
    [key: string]: unknown;
  } | null>(null);

  /**
   * /** Schedule a debounced refresh. If `expectedRevision` is provided, the refresh will
   * not resolve until the fetched styleRevision matches (with a single retry).
   */
  async function refresh(expectedRevision?: string): Promise<void> {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }

    return new Promise<void>((resolve) => {
      pendingResolve = resolve;

      pendingTimer = setTimeout(async () => {
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const { data, error: actionError } =
              await actions.styles.getRenderStyles({});

            if (actionError) {
              console.warn(
                "[Agent] Failed to fetch render styles:",
                actionError,
              );
              break;
            }

            const renderStyles = data?.success ? data.data : null;
            if (!renderStyles?.styleRevision) {
              break;
            }

            const revision = String(renderStyles.styleRevision);

            if (
              !expectedRevision ||
              revision === expectedRevision ||
              attempt === 1
            ) {
              lastStyleRevision.value = revision;
              lastRenderStyles.value = renderStyles;
              break;
            }

            // Wait before retry if revision doesn't match
            await new Promise((r) => setTimeout(r, 400));
          }
        } catch (err) {
          console.warn("[Agent] Failed to refresh design context:", err);
        } finally {
          pendingResolve?.();
          pendingResolve = null;
          pendingTimer = null;
        }
      }, DEBOUNCE_MS);
    });
  }

  return { refresh, lastStyleRevision, lastRenderStyles };
}
