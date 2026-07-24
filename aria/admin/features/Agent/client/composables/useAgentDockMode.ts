import { ref, readonly } from "vue";

const STORAGE_KEY = "aria-engineer-dock-mode";

function readStoredDockMode(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return true;
  return raw === "true";
}

function writeStoredDockMode(docked: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(docked));
}

const isDocked = ref<boolean>(readStoredDockMode());

export function useAgentDockMode() {
  function dock(): void {
    isDocked.value = true;
    writeStoredDockMode(true);
  }

  function undock(): void {
    isDocked.value = false;
    writeStoredDockMode(false);
  }

  function toggleDockMode(): void {
    isDocked.value ? undock() : dock();
  }

  return {
    isDocked: readonly(isDocked),
    dock,
    undock,
    toggleDockMode,
  };
}
