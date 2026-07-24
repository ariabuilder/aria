import { ref, readonly } from "vue";
import type {
  AgentComposerMode,
  AgentSeoContext,
  AgentShellContext,
} from "../../lib/schemas";

const isOpen = ref(false);
const openRequestId = ref(0);
const seedPrompt = ref<string | null>(null);
const seoContext = ref<AgentSeoContext | null>(null);
const pendingShellContext = ref<AgentShellContext | null>(null);
const shouldFocusComposer = ref(true);
const autoSend = ref(false);
const requestedComposerMode = ref<AgentComposerMode | null>(null);

export interface OpenAgentPanelOptions {
  seed?: string;
  seoContext?: AgentSeoContext;
  shellContext?: AgentShellContext;
  focusComposer?: boolean;
  autoSend?: boolean;
  composerMode?: AgentComposerMode;
}

export function useAgentPanel() {
  function open(options?: OpenAgentPanelOptions): void {
    seedPrompt.value = options?.seed?.trim() || null;
    seoContext.value = options?.seoContext ?? null;
    pendingShellContext.value = options?.shellContext ?? null;
    shouldFocusComposer.value = options?.focusComposer ?? true;
    autoSend.value = options?.autoSend ?? false;
    requestedComposerMode.value = options?.composerMode ?? null;
    isOpen.value = true;
    openRequestId.value += 1;
  }

  function close(): void {
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    }
    isOpen.value = false;
    seedPrompt.value = null;
    seoContext.value = null;
    pendingShellContext.value = null;
    shouldFocusComposer.value = true;
    autoSend.value = false;
    requestedComposerMode.value = null;
  }

  function toggle(
    options?: Pick<OpenAgentPanelOptions, "focusComposer">,
  ): void {
    if (isOpen.value) {
      close();
    } else {
      open(options);
    }
  }

  function consumeSeedPrompt(): string | null {
    const value = seedPrompt.value;
    seedPrompt.value = null;
    return value;
  }

  function consumeSeoContext(): AgentSeoContext | null {
    const value = seoContext.value;
    seoContext.value = null;
    return value;
  }

  function consumeAutoSend(): boolean {
    const value = autoSend.value;
    autoSend.value = false;
    return value;
  }

  function consumeRequestedComposerMode(): AgentComposerMode | null {
    const value = requestedComposerMode.value;
    requestedComposerMode.value = null;
    return value;
  }

  return {
    isOpen: readonly(isOpen),
    openRequestId: readonly(openRequestId),
    open,
    close,
    toggle,
    consumeSeedPrompt,
    consumeSeoContext,
    consumeAutoSend,
    consumeRequestedComposerMode,
    pendingSeoContext: readonly(seoContext),
    pendingShellContext: readonly(pendingShellContext),
    shouldFocusComposer: readonly(shouldFocusComposer),
  };
}
