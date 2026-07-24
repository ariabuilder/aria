/**
 * Type-safe access to the currently authenticated user. Fetches
 * user data through the Auth API boundary.
 */

import { ref, type Ref } from "vue";
import { type SessionUser } from "../../../../lib/auth/types";
import { getFoucAppearanceStorageKey } from "../../../../lib/schemas/appearance";

import { getCurrentUser } from "./useAuthApi";

const SITE_SETTINGS_STORAGE_KEY = "aria-site-settings";

// Module-level singleton — every caller must observe the same session user.
const user = ref<SessionUser | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
let inflightFetch: Promise<void> | null = null;
const AUTH_FETCH_RETRY_DELAYS_MS = [250, 1_000] as const;

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function clearAppearanceMirror(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getFoucAppearanceStorageKey(userId));
  } catch {
    // Ignore storage failures during auth transitions.
  }
}

function clearSiteSettingsCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SITE_SETTINGS_STORAGE_KEY);
  } catch {
    // Ignore storage failures during auth transitions.
  }
}

function hasAuthIdentityChanged(
  previous: SessionUser | null,
  next: SessionUser | null,
): boolean {
  if (!previous || !next) {
    return previous?.id !== next?.id;
  }

  if (previous.id !== next.id || previous.role !== next.role) {
    return true;
  }

  return (
    JSON.stringify(previous.permissionProfile ?? null) !==
    JSON.stringify(next.permissionProfile ?? null)
  );
}

export interface UseUserReturn {
  /** Current authenticated user (null if not loaded or error) */
  user: Ref<SessionUser | null>;
  /** Loading state */
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  fetchUser: (options?: { force?: boolean }) => Promise<void>;
  clearUser: () => void;
}

export function isSessionUserId(userId: string): boolean {
  if (user.value?.id === userId) {
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  return document.documentElement.dataset.ariaUserId === userId;
}

/** Optimistically merge profile fields into the session user singleton. */
export function patchSessionUser(
  patch: Partial<SessionUser> & { id: SessionUser["id"] },
): void {
  if (!user.value || user.value.id !== patch.id) {
    return;
  }

  user.value = {
    ...user.value,
    ...patch,
  };
}

/** Patch session user when editing your own profile in settings. */
export function syncSessionUserIfSelf(
  updated: Partial<SessionUser> & { id: SessionUser["id"] },
): boolean {
  if (!isSessionUserId(updated.id)) {
    return false;
  }

  patchSessionUser({
    id: updated.id,
    avatarUrl: updated.avatarUrl ?? null,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    totpEnabled: updated.totpEnabled,
    permissionProfile: updated.permissionProfile,
  });

  return true;
}

export function useUser(): UseUserReturn {
  async function fetchUser(options?: { force?: boolean }): Promise<void> {
    if (inflightFetch) {
      return inflightFetch;
    }
    if (user.value && !options?.force) return;

    inflightFetch = (async () => {
      // A background refresh must not replace a known user with a loading or
      // signed-out state. Only the initial identity fetch blocks the UI.
      isLoading.value = user.value === null;
      error.value = null;

      try {
        let result = await getCurrentUser();
        for (const delayMs of AUTH_FETCH_RETRY_DELAYS_MS) {
          if (!result.error) break;
          await waitForRetry(delayMs);
          result = await getCurrentUser();
        }

        const { data, error: fetchError } = result;

        if (fetchError) {
          error.value = fetchError;
          // Transport/server failures do not prove that the session ended.
          // Keep the last authenticated identity and its capabilities.
          return;
        }

        if (hasAuthIdentityChanged(user.value, data ?? null)) {
          if (user.value?.id) {
            clearAppearanceMirror(user.value.id);
          }
          clearSiteSettingsCache();
        }

        user.value = data ?? null;
      } catch (err) {
        error.value = err instanceof Error ? err.message : "Unknown error";
        // Preserve the last known identity on unexpected client failures too.
      } finally {
        isLoading.value = false;
        inflightFetch = null;
      }
    })();

    return inflightFetch;
  }

  function clearUser(): void {
    if (user.value?.id) {
      clearAppearanceMirror(user.value.id);
    }
    clearSiteSettingsCache();
    user.value = null;
    error.value = null;
  }

  return {
    user,
    isLoading,
    error,
    fetchUser,
    clearUser,
  };
}
