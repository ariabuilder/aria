import {
  computed,
  inject,
  unref,
  type InjectionKey,
  type ComputedRef,
  type Ref,
} from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  APP_INJECTION_KEYS,
  type StageIframeLike,
} from "../types/injectionKeys";

const APP_RUNTIME_PROVIDER_OWNER = "useAppProvides() in aria/admin/App.vue";

function injectRequired<T>(key: InjectionKey<T>, label: string): T {
  const injectedValue = inject(key, undefined);

  if (injectedValue === undefined) {
    throw new Error(
      `Missing required app runtime injection: ${label}. Ensure ${APP_RUNTIME_PROVIDER_OWNER} is mounted.`,
    );
  }

  return injectedValue;
}

function unwrapStageIframe(value: unknown): HTMLIFrameElement | null {
  if (value instanceof HTMLIFrameElement) {
    return value;
  }

  const next = unref(value as StageIframeLike | Ref<StageIframeLike>);
  if (next !== value) {
    return unwrapStageIframe(next);
  }

  if (next && typeof next === "object" && "iframeRef" in next) {
    return unwrapStageIframe(
      (next as { iframeRef?: HTMLIFrameElement | null }).iframeRef,
    );
  }

  return null;
}

function resolveStageIframeLike(
  stageIframeLike: StageIframeLike,
): HTMLIFrameElement | null {
  return unwrapStageIframe(stageIframeLike);
}

export function useInjectedPageBlocks(): Ref<BuilderNode[]> {
  return injectRequired(APP_INJECTION_KEYS.pageBlocks, "pageBlocks");
}

export function useInjectedStageIframeRef(): ComputedRef<HTMLIFrameElement | null> {
  const injectedStageIframeRef = injectRequired(
    APP_INJECTION_KEYS.stageIframeRef,
    "stageIframeRef",
  );

  return computed(() => {
    return resolveStageIframeLike(injectedStageIframeRef.value);
  });
}

export function useOptionalStageIframeRef(): ComputedRef<HTMLIFrameElement | null> {
  const injectedStageIframeRef = inject(
    APP_INJECTION_KEYS.stageIframeRef,
    undefined,
  );

  return computed(() => {
    if (injectedStageIframeRef === undefined) {
      return null;
    }

    return resolveStageIframeLike(unref(injectedStageIframeRef));
  });
}

export function useInjectedPrefetchPageData(): (slug: string) => Promise<void> {
  return injectRequired(
    APP_INJECTION_KEYS.prefetchPageData,
    "prefetchPageData",
  );
}

export function useInjectedPrewarmBuilder(): () => Promise<void> {
  return injectRequired(APP_INJECTION_KEYS.prewarmBuilder, "prewarmBuilder");
}
