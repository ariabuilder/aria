import {
  nextTick,
  ref,
  watch,
  type MaybeRefOrGetter,
  toValue,
} from "vue";

export interface SlidingNavIndicatorState {
  top: number;
  height: number;
  visible: boolean;
}

export interface UseSlidingNavIndicatorOptions {
  enabled: MaybeRefOrGetter<boolean>;
  activeKey: MaybeRefOrGetter<string | null>;
  /**
   * When true, the indicator only appears while hovering. The active item keeps
   * its own styles (e.g. nav-border-active) when idle.
   */
  hoverOnly?: MaybeRefOrGetter<boolean>;
  /**
   * When hoverOnly is true, skip the indicator if the hovered item is already
   * active (avoids doubling the primary stripe).
   */
  hideWhenOnActive?: MaybeRefOrGetter<boolean>;
  /**
   * When true, hide the indicator and skip layout measurement (e.g. during
   * sidebar width transition when nav geometry is unstable).
   */
  paused?: MaybeRefOrGetter<boolean>;
}

function measureNavTarget(nav: HTMLElement, target: HTMLElement) {
  const navRect = nav.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  return {
    top: targetRect.top - navRect.top + nav.scrollTop,
    height: targetRect.height,
  };
}

export function useSlidingNavIndicator(options: UseSlidingNavIndicatorOptions) {
  const navRef = ref<HTMLElement | null>(null);
  const buttonEls = new Map<string, HTMLElement>();
  const hoveredKey = ref<string | null>(null);
  const indicator = ref<SlidingNavIndicatorState>({
    top: 0,
    height: 0,
    visible: false,
  });
  const indicatorAnimated = ref(false);
  let indicatorUpdateQueued = false;

  function registerButton(key: string, el: HTMLElement | null) {
    const existing = buttonEls.get(key);

    if (el) {
      if (existing === el) return;
      buttonEls.set(key, el);
    } else {
      if (!existing) return;
      buttonEls.delete(key);
    }

    queueIndicatorUpdate();
  }

  function isPaused() {
    return toValue(options.paused) ?? false;
  }

  function queueIndicatorUpdate() {
    if (isPaused()) return;
    if (indicatorUpdateQueued) return;
    indicatorUpdateQueued = true;

    const run = () => {
      indicatorUpdateQueued = false;
      void updateIndicator();
    };

    if (
      !indicatorAnimated.value &&
      typeof requestIdleCallback !== "undefined"
    ) {
      requestIdleCallback(run, { timeout: 250 });
      return;
    }

    requestAnimationFrame(run);
  }

  async function updateIndicator() {
    await nextTick();

    if (!toValue(options.enabled) || isPaused()) {
      indicator.value.visible = false;
      return;
    }

    const nav = navRef.value;
    const activeKey = toValue(options.activeKey);
    const hoverOnly = toValue(options.hoverOnly) ?? true;
    const hideWhenOnActive = toValue(options.hideWhenOnActive) ?? true;

    let targetKey: string | null;
    if (hoverOnly) {
      targetKey = hoveredKey.value;
      if (
        targetKey &&
        hideWhenOnActive &&
        activeKey &&
        targetKey === activeKey
      ) {
        targetKey = null;
      }
    } else {
      targetKey = hoveredKey.value ?? activeKey;
    }

    const targetButton = targetKey ? buttonEls.get(targetKey) : null;

    if (!nav || !targetButton) {
      indicator.value.visible = false;
      return;
    }

    const { top, height } = measureNavTarget(nav, targetButton);

    indicator.value = {
      top,
      height,
      visible: true,
    };

    if (!indicatorAnimated.value) {
      requestAnimationFrame(() => {
        indicatorAnimated.value = true;
      });
    }
  }

  function onItemEnter(key: string) {
    hoveredKey.value = key;
    void updateIndicator();
  }

  function onNavLeave() {
    hoveredKey.value = null;
    void updateIndicator();
  }

  watch(
    () =>
      [
        toValue(options.enabled),
        toValue(options.activeKey),
        isPaused(),
      ] as const,
    () => {
      void updateIndicator();
    },
  );

  watch(navRef, (nav, _, onCleanup) => {
    if (!nav) return;

    const observer = new ResizeObserver(() => {
      queueIndicatorUpdate();
    });
    observer.observe(nav);
    onCleanup(() => observer.disconnect());
  });

  return {
    navRef,
    indicator,
    indicatorAnimated,
    registerButton,
    onItemEnter,
    onNavLeave,
    updateIndicator,
  };
}
