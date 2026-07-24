import { log } from "@/lib/utils/logger";

type UnoRuntimeWindow = Window & {
  __unocss_runtime?: {
    uno?: {
      extractAll?: () => Promise<void>;
    };
    update?: () => void;
  };
};

const debounceTimers = new WeakMap<
  Window,
  { timer: number; resolve: () => void }
>();

/**
 * Scan the stage iframe DOM so newly added utility classes (e.g. from paste) get CSS rules.
 */
export async function requestStageUnoExtract(
  win: Window | null | undefined,
): Promise<void> {
  const runtimeWindow = win as UnoRuntimeWindow | null | undefined;
  if (!runtimeWindow?.__unocss_runtime) {
    return;
  }

  try {
    if (runtimeWindow.__unocss_runtime.uno?.extractAll) {
      await runtimeWindow.__unocss_runtime.uno.extractAll();
      return;
    }

    runtimeWindow.__unocss_runtime.update?.();
  } catch (error) {
    log("warn", "[Stage] UnoCSS extract after class change failed", { error });
  }
}

export function requestStageUnoExtractDebounced(
  win: Window | null | undefined,
  delayMs = 80,
): Promise<void> {
  const runtimeWindow = win as UnoRuntimeWindow | null | undefined;
  if (!runtimeWindow?.__unocss_runtime) {
    return Promise.resolve();
  }

  const existing = debounceTimers.get(runtimeWindow);
  if (existing) {
    runtimeWindow.clearTimeout(existing.timer);
    existing.resolve();
  }

  return new Promise((resolve) => {
    const timer = runtimeWindow.setTimeout(() => {
      debounceTimers.delete(runtimeWindow);
      void requestStageUnoExtract(runtimeWindow).finally(resolve);
    }, delayMs);

    debounceTimers.set(runtimeWindow, { timer, resolve });
  });
}
