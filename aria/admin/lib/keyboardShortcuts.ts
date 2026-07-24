export const SIDEBAR_TOGGLE_SHORTCUT_KEY = "[" as const;
export const SEARCH_MODIFIER_SHORTCUT_KEY = "k" as const;
export const SETTINGS_MODIFIER_SHORTCUT_KEY = "," as const;
export const AGENT_ALT_SHORTCUT_KEY = "e" as const;
export const AGENT_SHORTCUT_KEY = "]" as const;

let isMacPlatformCache: boolean | null = null;

export function isMacPlatform(): boolean {
  if (isMacPlatformCache !== null) {
    return isMacPlatformCache;
  }

  if (typeof navigator === "undefined") {
    isMacPlatformCache = false;
    return isMacPlatformCache;
  }

  isMacPlatformCache =
    /Mac|iPhone|iPod|iPad/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

  return isMacPlatformCache;
}

export function formatModifierShortcut(key: string): string {
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}

export function formatAltShortcut(key: string): string {
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  return isMacPlatform() ? `⌥${normalizedKey}` : `Alt+${normalizedKey}`;
}

export function formatShiftModifierShortcut(key: string): string {
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  return isMacPlatform() ? `⌘⇧${normalizedKey}` : `Ctrl+Shift+${normalizedKey}`;
}

/**
 * Build a shortcut lookup key from a keyboard event. Option/Alt +
 * letter on macOS often emits a special character in `event.
 */
export function resolveShortcutKeyFromEvent(
  event: KeyboardEvent,
): string | null {
  const eventKey = event.key;
  if (typeof eventKey !== "string" || eventKey.length === 0) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");

  const key =
    event.altKey && /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3).toLowerCase()
      : eventKey.toLowerCase();
  parts.push(key);
  return parts.join("+");
}
