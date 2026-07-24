import { readonly, ref, type DeepReadonly, type Ref } from "vue";

export interface DebouncedSettingsSaveOptions<T> {
  getPayload: () => T;
  save: (payload: T) => Promise<void>;
  serialize?: (payload: T) => string;
  debounceMs?: number;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface DebouncedSettingsSaveReturn<T> {
  isSaving: DeepReadonly<Ref<boolean>>;
  hasPendingSave: DeepReadonly<Ref<boolean>>;
  scheduleSave: () => void;
  flushSave: () => Promise<void>;
  onBlur: () => void;
  markSaved: (payload?: T) => void;
  shouldSyncFromRemote: () => boolean;
  isDirty: () => boolean;
  dispose: () => void;
}

const DEFAULT_DEBOUNCE_MS = 700;

export function useDebouncedSettingsSave<T>(
  options: DebouncedSettingsSaveOptions<T>,
): DebouncedSettingsSaveReturn<T> {
  const isSaving = ref(false);
  const hasPendingSave = ref(false);
  const serialize = options.serialize ?? ((payload: T) => JSON.stringify(payload));

  let lastSavedSnapshot = "";
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlightSave: Promise<void> | null = null;

  function syncSnapshot(payload: T): void {
    lastSavedSnapshot = serialize(payload);
  }

  function isDirty(): boolean {
    return serialize(options.getPayload()) !== lastSavedSnapshot;
  }

  function clearDebounceTimer(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function scheduleSave(): void {
    if (!isDirty()) {
      return;
    }

    clearDebounceTimer();
    hasPendingSave.value = true;

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flushSave();
    }, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  async function flushSave(): Promise<void> {
    clearDebounceTimer();

    if (!isDirty()) {
      hasPendingSave.value = false;
      return;
    }

    if (inFlightSave) {
      await inFlightSave;
      if (!isDirty()) {
        hasPendingSave.value = false;
        return;
      }
    }

    isSaving.value = true;
    const payload = options.getPayload();

    const savePromise = (async () => {
      try {
        await options.save(payload);
        syncSnapshot(payload);
      } catch (error) {
        await options.onError?.(error);
      } finally {
        isSaving.value = false;
        hasPendingSave.value = false;
        inFlightSave = null;
      }
    })();

    inFlightSave = savePromise;
    await savePromise;
  }

  function onBlur(): void {
    scheduleSave();
  }

  function markSaved(payload?: T): void {
    clearDebounceTimer();
    syncSnapshot(payload ?? options.getPayload());
    hasPendingSave.value = false;
  }

  function shouldSyncFromRemote(): boolean {
    return !hasPendingSave.value && !isSaving.value;
  }

  function dispose(): void {
    clearDebounceTimer();
    hasPendingSave.value = false;
  }

  return {
    isSaving: readonly(isSaving),
    hasPendingSave: readonly(hasPendingSave),
    scheduleSave,
    flushSave,
    onBlur,
    markSaved,
    shouldSyncFromRemote,
    isDirty,
    dispose,
  };
}
