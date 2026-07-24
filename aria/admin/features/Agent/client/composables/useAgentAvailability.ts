import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { unwrapAgentAvailabilityPayload } from "./agentActionResults";
import type { AgentAvailability } from "../../lib/schemas";

const availability = ref<AgentAvailability | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
let lastLoadedAt = 0;
const AVAILABILITY_STALE_MS = 15_000;

export function useAgentAvailability() {
  const canShowAgentShell = computed(
    () => availability.value?.canShowAgentShell ?? false,
  );
  const canUseStudioAgent = computed(
    () => availability.value?.canUseStudioAgent ?? false,
  );
  const needsSetup = computed(
    () => availability.value?.reason === "inference_setup_required",
  );

  async function refresh(options: { force?: boolean } = {}): Promise<AgentAvailability | null> {
    const now = Date.now();
    if (
      !options.force &&
      availability.value &&
      now - lastLoadedAt < AVAILABILITY_STALE_MS
    ) {
      return availability.value;
    }

    isLoading.value = true;
    error.value = null;
    try {
      const { data, error: actionError } = await actions.agent.getAvailability({});
      if (actionError) {
        throw actionError;
      }
      availability.value = unwrapAgentAvailabilityPayload(data);
      lastLoadedAt = Date.now();
      return availability.value;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to load agent availability";
      return availability.value;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    availability,
    isLoading,
    error,
    canShowAgentShell,
    canUseStudioAgent,
    needsSetup,
    refresh,
  };
}
