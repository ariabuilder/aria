import { ref } from "vue";
import { actions } from "astro:actions";
import { parseAdapterInfoPayload } from "@/composables/platformActionResults";
import type { AgentPlatform } from "../../lib/schemas";

const platform = ref<AgentPlatform | null>(null);
let refreshPromise: Promise<AgentPlatform> | null = null;

export function useRuntimePlatform() {
  async function refresh(): Promise<AgentPlatform> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const { data, error } = await actions.platform.info({});
        if (error) {
          throw error;
        }
        const info = parseAdapterInfoPayload(data);
        platform.value = info.platform === "cloudflare" ? "cloudflare" : "local";
      } catch {
        platform.value = "local";
      }
      return platform.value;
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  return {
    platform,
    refresh,
  };
}
