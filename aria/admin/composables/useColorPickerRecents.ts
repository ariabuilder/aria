import { ref } from "vue";
import { colord } from "colord";
import { z } from "zod";

import { extractCssVariableReferenceKey } from "@/features/Design/lib/colorPickerValue";
import { toSerializedHex } from "@/features/Design/lib/colorFormat";

const STORAGE_KEY = "aria-color-picker-recents";
const MAX_RECENTS = 13;

const RecentsSchema = z.array(z.string().trim().min(1));

function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readRecents(): string[] {
  if (!isStorageAvailable()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    const validated = RecentsSchema.safeParse(parsed);
    return validated.success ? validated.data : [];
  } catch {
    return [];
  }
}

function writeRecents(values: string[]): void {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore quota errors
  }
}

function canAddToRecents(value: string, showAlpha: boolean): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (extractCssVariableReferenceKey(trimmed) !== null) {
    return false;
  }

  if (trimmed.startsWith("var(--")) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "transparent" || lower === "currentcolor") {
    return false;
  }

  const parsed = colord(trimmed);
  if (!parsed.isValid()) {
    return false;
  }

  return Boolean(toSerializedHex(parsed, showAlpha));
}

function normalizeRecentValue(value: string, showAlpha: boolean): string | null {
  const parsed = colord(value.trim());
  if (!parsed.isValid()) {
    return null;
  }

  return toSerializedHex(parsed, showAlpha);
}

const recentsRef = ref<string[]>(readRecents());

export function useColorPickerRecents() {
  function pushRecent(value: string, showAlpha = true): void {
    if (!canAddToRecents(value, showAlpha)) {
      return;
    }

    const normalized = normalizeRecentValue(value, showAlpha);
    if (!normalized) {
      return;
    }

    const next = [
      normalized,
      ...recentsRef.value.filter((entry) => entry !== normalized),
    ].slice(0, MAX_RECENTS);

    recentsRef.value = next;
    writeRecents(next);
  }

  function refreshFromStorage(): void {
    recentsRef.value = readRecents();
  }

  return {
    recents: recentsRef,
    pushRecent,
    refreshFromStorage,
  };
}
