const THEME_TRANSITION_CLASS = "the-premium-fade-transition";

let themeTransitionInFlight: Promise<void> | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasActiveViewTransition(): boolean {
  if (typeof document === "undefined") return false;
  return "activeViewTransition" in document && document.activeViewTransition != null;
}

export async function applyAppearanceWithTransition(
  commit: () => void,
  options?: { animate?: boolean },
): Promise<void> {
  const animate = options?.animate ?? true;
  const reducedMotion = prefersReducedMotion();
  const canTransition =
    animate &&
    !reducedMotion &&
    !hasActiveViewTransition() &&
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function";

  const run = async (): Promise<void> => {
    if (!canTransition) {
      commit();
      return;
    }

    const html = document.documentElement;
    html.classList.add(THEME_TRANSITION_CLASS);

    try {
      const transition = document.startViewTransition(() => {
        commit();
      });
      await transition.finished;
    } finally {
      html.classList.remove(THEME_TRANSITION_CLASS);
    }
  };

  if (themeTransitionInFlight) {
    await themeTransitionInFlight;
  }

  const pending = run();
  themeTransitionInFlight = pending;

  try {
    await pending;
  } finally {
    if (themeTransitionInFlight === pending) {
      themeTransitionInFlight = null;
    }
  }
}

export async function waitForThemeTransitionIdle(): Promise<void> {
  if (themeTransitionInFlight) {
    await themeTransitionInFlight;
  }
}

export function isThemeTransitionInFlight(): boolean {
  return themeTransitionInFlight !== null;
}
