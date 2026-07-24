import { ref, watch } from "vue";

const STORAGE_KEY = "aria-viewport";
const DEFAULT_VIEWPORT = "base";

function normalizeViewportName(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (normalized === "desktop" || normalized === "default") {
    return "base";
  }

  return normalized || null;
}

function getStoredViewport(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeViewportName(localStorage.getItem(STORAGE_KEY));
}

const viewport = ref(getStoredViewport() ?? DEFAULT_VIEWPORT);

let hasHydratedViewport = false;
let hasPersistenceWatcher = false;

function hydrateViewport(): void {
  if (hasHydratedViewport || typeof window === "undefined") {
    return;
  }

  const savedViewport = getStoredViewport();
  if (savedViewport) {
    viewport.value = savedViewport;
  }

  hasHydratedViewport = true;
}

function ensureViewportPersistence(): void {
  if (hasPersistenceWatcher) {
    return;
  }

  hasPersistenceWatcher = true;

  watch(viewport, (newViewport) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newViewport);
    }
  });
}

export function useViewport() {
  hydrateViewport();
  ensureViewportPersistence();

  function setViewport(name: string) {
    viewport.value = name;
  }

  return { viewport, setViewport };
}
