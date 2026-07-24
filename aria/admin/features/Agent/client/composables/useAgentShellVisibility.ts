import { computed } from "vue";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useCapabilities } from "@/composables/useCapabilities";
import { isFeatureEnabled } from "@/lib/features";
import {
  hasEnabledInferenceProvider,
  mergeAgentSettings,
} from "../../lib/schemas";

export function useAgentShellVisibility() {
  const { hasCapability } = useCapabilities();
  const { settings } = useSiteSettings();

  const showAgentShell = computed(() => {
    if (!isFeatureEnabled("studio.agent")) {
      return false;
    }
    if (!hasCapability("useStudioAgent")) {
      return false;
    }
    return hasEnabledInferenceProvider(
      mergeAgentSettings(settings.value?.agent, {}),
    );
  });

  return { showAgentShell };
}
