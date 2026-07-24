import { onMounted, onUnmounted } from "vue";
import { AGENT_OPEN_EVENT } from "../../lib/constants";
import { useAgentPanel } from "./useAgentPanel";

export function useGlobalAgentShortcuts() {
  const panel = useAgentPanel();

  function handleOpenAgentEvent(event: Event): void {
    const focusComposer =
      event instanceof CustomEvent &&
      typeof event.detail === "object" &&
      event.detail !== null &&
      "focusComposer" in event.detail
        ? Boolean((event.detail as { focusComposer?: unknown }).focusComposer)
        : true;

    panel.toggle({ focusComposer });
  }

  onMounted(() => {
    window.addEventListener(AGENT_OPEN_EVENT, handleOpenAgentEvent);
  });

  onUnmounted(() => {
    window.removeEventListener(AGENT_OPEN_EVENT, handleOpenAgentEvent);
  });

  return {
    open: panel.open,
    close: panel.close,
    toggle: panel.toggle,
  };
}
