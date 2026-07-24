import { onMounted, onBeforeUnmount } from "vue";
import type { Ref } from "vue";
import { useStudioI18n } from "@/i18n";
import {
  SEARCH_MODIFIER_SHORTCUT_KEY,
  SETTINGS_MODIFIER_SHORTCUT_KEY,
  AGENT_ALT_SHORTCUT_KEY,
  AGENT_SHORTCUT_KEY,
  resolveShortcutKeyFromEvent,
} from "@/lib/keyboardShortcuts";

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
  allowInInput?: boolean;
}

/**
 * useKeyboardShortcuts - Global keyboard shortcut manager
 *
 * Keyboard shortcuts for canvas/editor operations.
 * Supports modifiers (Ctrl/Cmd, Shift, Alt) and prevents conflicts.
 */
export function useKeyboardShortcuts(enabled: Ref<boolean> | boolean = true) {
  const { t } = useStudioI18n();
  const shortcuts = new Map<string, ShortcutConfig>();

  /**
   * Generate unique key for shortcut
   */
  const getShortcutKey = (
    config: Omit<
      ShortcutConfig,
      "callback" | "description" | "preventDefault" | "allowInInput"
    >,
  ): string => {
    const parts = [];
    if (config.ctrl) parts.push("ctrl");
    if (config.meta) parts.push("meta");
    if (config.shift) parts.push("shift");
    if (config.alt) parts.push("alt");
    parts.push(config.key.toLowerCase());
    return parts.join("+");
  };

  /**
   * Register a keyboard shortcut
   */
  const register = (config: ShortcutConfig) => {
    const key = getShortcutKey(config);
    shortcuts.set(key, config);
  };

  /**
   * Unregister a keyboard shortcut
   */
  const unregister = (
    config: Omit<
      ShortcutConfig,
      "callback" | "description" | "preventDefault" | "allowInInput"
    >,
  ) => {
    const key = getShortcutKey(config);
    shortcuts.delete(key);
  };

  /**
   * Handle keyboard event
   */
  const handleKeyDown = (event: KeyboardEvent) => {
    // Check if shortcuts are enabled
    const isEnabled = typeof enabled === "boolean" ? enabled : enabled.value;
    if (!isEnabled) return;

    const key = resolveShortcutKeyFromEvent(event);
    if (!key) {
      // Autofill, IME, and some password managers emit keydown without a key.
      return;
    }

    // Always allow undo/redo shortcuts (Cmd+Z, Cmd+Shift+Z) even in input fields
    const isUndoRedo =
      key === "meta+z" ||
      key === "ctrl+z" ||
      key === "meta+shift+z" ||
      key === "ctrl+shift+z";

    const shortcut = shortcuts.get(key);
    const allowInInput = Boolean(shortcut?.allowInInput);

    // Don't trigger shortcuts when typing in inputs unless explicitly allowed
    const target = event.target as HTMLElement;
    if (
      !isUndoRedo &&
      !allowInInput &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    if (shortcut) {
      if (shortcut.preventDefault !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
      shortcut.callback(event);
    }
  };

  /**
   * Register common editor shortcuts
   */
  const registerCommonShortcuts = (callbacks: {
    onUndo?: () => void;
    onRedo?: () => void;
    onCopy?: () => void;
    onCut?: () => void;
    onPaste?: () => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
    onSelectParent?: () => void;
    onSave?: () => void;
    onPreview?: () => void;
    onConvertComponent?: () => void;
    onFullscreen?: () => void;
    onSearch?: () => void;
    onSettings?: () => void;
    onAgent?: () => void;
  }) => {
    const registerWithModifier = (
      key: string,
      callback: () => void,
      description: string,
      shift = false,
    ) => {
      // Register for Mac (Meta)
      register({
        key,
        meta: true,
        shift,
        callback,
        description,
      });
      // Register for Windows/Linux (Ctrl)
      register({
        key,
        ctrl: true,
        shift,
        callback,
        description,
      });
    };

    if (callbacks.onUndo) {
      registerWithModifier("z", callbacks.onUndo, t("composer.canvas.undo"));
    }

    if (callbacks.onRedo) {
      registerWithModifier("z", callbacks.onRedo, t("composer.canvas.redo"), true);
    }

    if (callbacks.onCopy) {
      registerWithModifier("c", callbacks.onCopy, t("common.copy"));
    }

    if (callbacks.onCut) {
      registerWithModifier("x", callbacks.onCut, t("common.cut"));
    }

    if (callbacks.onPaste) {
      registerWithModifier("v", callbacks.onPaste, t("common.paste"));
    }

    if (callbacks.onDelete) {
      register({
        key: "Delete",
        callback: callbacks.onDelete,
        description: t("common.delete"),
      });
      register({
        key: "Backspace",
        callback: callbacks.onDelete,
        description: t("common.delete"),
      });
    }

    if (callbacks.onDuplicate) {
      registerWithModifier("d", callbacks.onDuplicate, t("common.duplicate"));
    }

    if (callbacks.onSelectParent) {
      register({
        key: "Escape",
        callback: callbacks.onSelectParent,
        description: t("composer.shortcuts.selectParent"),
      });
    }

    if (callbacks.onSave) {
      registerWithModifier("s", callbacks.onSave, t("common.save"));
    }

    if (callbacks.onPreview) {
      registerWithModifier("p", callbacks.onPreview, t("composer.shortcuts.togglePreview"), true);
    }

    if (callbacks.onConvertComponent) {
      registerWithModifier(
        "c",
        callbacks.onConvertComponent,
        t("composer.shortcuts.convertToComponent"),
        true,
      );
    }

    if (callbacks.onFullscreen) {
      registerWithModifier(
        "f",
        callbacks.onFullscreen,
        t("composer.shortcuts.toggleFullscreen"),
        true,
      );
    }

    if (callbacks.onSearch) {
      register({
        key: SEARCH_MODIFIER_SHORTCUT_KEY,
        meta: true,
        callback: callbacks.onSearch,
        description: t("composer.shortcuts.openSearch"),
        allowInInput: true,
      });
      register({
        key: SEARCH_MODIFIER_SHORTCUT_KEY,
        ctrl: true,
        callback: callbacks.onSearch,
        description: t("composer.shortcuts.openSearch"),
        allowInInput: true,
      });
    }

    if (callbacks.onSettings) {
      register({
        key: SETTINGS_MODIFIER_SHORTCUT_KEY,
        meta: true,
        callback: callbacks.onSettings,
        description: t("composer.shortcuts.openSettings"),
        allowInInput: true,
      });
      register({
        key: SETTINGS_MODIFIER_SHORTCUT_KEY,
        ctrl: true,
        callback: callbacks.onSettings,
        description: t("composer.shortcuts.openSettings"),
        allowInInput: true,
      });
    }

    if (callbacks.onAgent) {
      register({
        key: AGENT_ALT_SHORTCUT_KEY,
        alt: true,
        callback: callbacks.onAgent,
        description: t("composer.shortcuts.toggleComposer"),
        allowInInput: true,
        preventDefault: true,
      });
      register({
        key: AGENT_SHORTCUT_KEY,
        callback: callbacks.onAgent,
        description: t("composer.shortcuts.toggleComposer"),
        allowInInput: true,
        preventDefault: true,
      });
    }
  };

  /**
   * Get all registered shortcuts (for documentation)
   */
  const getShortcuts = (): Array<{
    key: string;
    description: string;
  }> => {
    return Array.from(shortcuts.entries()).map(([key, config]) => ({
      key,
      description: config.description || "",
    }));
  };

  onMounted(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeyDown);
    shortcuts.clear();
  });

  return {
    register,
    unregister,
    registerCommonShortcuts,
    getShortcuts,
  };
}
