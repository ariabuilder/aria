import { ref, computed, watch } from "vue";
import { SIDEBAR_TOGGLE_SHORTCUT_KEY } from "@/lib/keyboardShortcuts";

export { SIDEBAR_TOGGLE_SHORTCUT_KEY };

const SIDEBAR_COLLAPSED_KEY = "aria:sidebar:collapsed";
const SIDEBAR_GROUPS_KEY = "aria:sidebar:groups";
/** Matches StudioSidebar `transition-[width] duration-200`. */
export const SIDEBAR_WIDTH_TRANSITION_MS = 200;

const isCollapsed = ref(true);
const openGroups = ref<Record<string, boolean>>({
  pages: false,
  layouts: false,
  components: false,
  collections: false,
  media: false,
  design: false,
});

const sidebarWidth = computed(() => (isCollapsed.value ? "w-12" : "w-60"));

const isSidebarAnimating = ref(false);
let sidebarAnimTimer: ReturnType<typeof setTimeout> | null = null;

function markSidebarAnimating() {
  isSidebarAnimating.value = true;

  if (sidebarAnimTimer !== null) {
    clearTimeout(sidebarAnimTimer);
  }

  sidebarAnimTimer = setTimeout(() => {
    isSidebarAnimating.value = false;
    sidebarAnimTimer = null;
  }, SIDEBAR_WIDTH_TRANSITION_MS);
}

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value;
}

function closeAllGroups() {
  openGroups.value = {
    pages: false,
    layouts: false,
    components: false,
    collections: false,
    media: false,
    design: false,
  };
}

function toggleGroup(id: string) {
  const isOpening = !openGroups.value[id];
  closeAllGroups();
  openGroups.value[id] = isOpening;
}

//
// Registered as a document-level *capture* listener so it:
//   1. Fires before any stopPropagation() from dialogs, focus traps, or
//      other handlers that would silently block it.
//   2. Cannot be removed by Vue component lifecycle teardown (which was
//      the root cause of the "stuck" shortcut — VueUse useEventListener
//      auto-cleans on unmount, and the `initialized` guard prevented
//      re-registration).
//   3. Skips editable targets (input / textarea / contentEditable) so
//      typing "[" in a text field doesn't toggle the sidebar.

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleSidebarKeydown(event: KeyboardEvent) {
  if (event.key !== SIDEBAR_TOGGLE_SHORTCUT_KEY) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isEditableTarget(event.target)) return;

  event.preventDefault();
  toggleSidebar();
}

if (typeof document !== "undefined") {
  document.addEventListener("keydown", handleSidebarKeydown, { capture: true });
}

if (typeof localStorage !== "undefined") {
  const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (savedCollapsed !== null) {
    isCollapsed.value = savedCollapsed === "true";
  }

  const savedGroups = localStorage.getItem(SIDEBAR_GROUPS_KEY);
  if (savedGroups !== null) {
    try {
      openGroups.value = JSON.parse(savedGroups);
    } catch {
      // ignore parse errors
    }
  }
}

watch(isCollapsed, (val, prev) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(val));
  }

  // Programmatic toggles (e.g. entering composer) still animate width.
  if (val !== prev) {
    markSidebarAnimating();
  }
});

watch(
  openGroups,
  (val) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(val));
    }
  },
  { deep: true },
);

export function useSidebarState() {
  return {
    isCollapsed,
    isSidebarAnimating,
    openGroups,
    sidebarWidth,
    toggleSidebar,
    toggleGroup,
    closeAllGroups,
  };
}
