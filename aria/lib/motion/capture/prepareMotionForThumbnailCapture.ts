/** Default cap while waiting for entrance CSS transitions to finish. */
export const MOTION_THUMBNAIL_SETTLE_TIMEOUT_MS = 3_000;

/**
 * Backup capture CSS — forces settled motion visuals even when stagger children
 * never received `.aria-motion` in static HTML.
 */
export function buildMotionThumbnailCaptureCss(): string {
  return `
    .aria-motion {
      opacity: 1 !important;
      transform: none !important;
      filter: none !important;
      clip-path: inset(0 0 0 0) !important;
    }
  `.trim();
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === 1;
}

type MotionCaptureRoot = Pick<ParentNode, "querySelectorAll">;
type AnimationCaptureRoot = MotionCaptureRoot & Node;

/**
 * Force Aria Motion elements into their post-entrance settled state for
 * thumbnail rasterisation. Mirrors the reduced-motion / aria-motion-now path in aria-motion.
 */
export function revealAriaMotionForCapture(root: MotionCaptureRoot): void {
  root.querySelectorAll(".aria-motion-stagger").forEach((group) => {
    group.querySelectorAll(":scope > *").forEach((child) => {
      if (!isElementNode(child)) {
        return;
      }

      child.classList.add("aria-motion-in");
    });
  });

  root.querySelectorAll(".aria-motion").forEach((element) => {
    element.classList.add("aria-motion-in");
  });

  root.querySelectorAll(".aria-motion-scrub").forEach((element) => {
    if (element instanceof HTMLElement) {
      element.setAttribute("data-aria-motion-capture", "settled");
    }
  });

  root.querySelectorAll(".aria-parallax").forEach((element) => {
    if (element instanceof HTMLElement) {
      element.setAttribute("data-aria-motion-capture", "settled");
    }
  });
}

/**
 * Self-contained browser function for Playwright `page.evaluate`. Must not
 * close over module scope — Playwright serialises the function body only.
 */
export function revealAriaMotionForCaptureInBrowser(): void {
  const root = document;

  root.querySelectorAll(".aria-motion-stagger").forEach((group) => {
    group.querySelectorAll(":scope > *").forEach((child) => {
      if (child.nodeType === 1) {
        child.classList.add("aria-motion-in");
      }
    });
  });

  root.querySelectorAll(".aria-motion").forEach((element) => {
    element.classList.add("aria-motion-in");
  });

  root.querySelectorAll(".aria-motion-scrub").forEach((element) => {
    if (element instanceof HTMLElement) {
      element.setAttribute("data-aria-motion-capture", "settled");
    }
  });

  root.querySelectorAll(".aria-parallax").forEach((element) => {
    if (element instanceof HTMLElement) {
      element.setAttribute("data-aria-motion-capture", "settled");
    }
  });
}

export async function waitForMotionSettle(
  root: MotionCaptureRoot,
  timeoutMs: number = MOTION_THUMBNAIL_SETTLE_TIMEOUT_MS,
): Promise<void> {
  const motionElements = Array.from(root.querySelectorAll(".aria-motion")).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );

  if (motionElements.length === 0) {
    return;
  }

  await Promise.all(
    motionElements.map(
      (element) =>
        new Promise<void>((resolve) => {
          let settled = false;

          const finalize = (): void => {
            if (settled) {
              return;
            }

            settled = true;
            element.removeEventListener("transitionend", handleTransitionEnd);
            window.clearTimeout(timeoutId);
            resolve();
          };

          const handleTransitionEnd = (event: TransitionEvent): void => {
            if (event.target !== element) {
              return;
            }

            finalize();
          };

          const timeoutId = window.setTimeout(finalize, timeoutMs);
          element.addEventListener("transitionend", handleTransitionEnd);
        }),
    ),
  );
}

export async function waitForFiniteAnimations(
  doc: Document,
  animationRoot: AnimationCaptureRoot,
): Promise<void> {
  const animations =
    typeof doc.getAnimations === "function" ? doc.getAnimations() : [];
  const candidates = animations.filter((anim) => {
    const effectTarget = (anim.effect as KeyframeEffect | null)?.target;
    if (
      effectTarget instanceof Node &&
      effectTarget !== animationRoot &&
      !animationRoot.contains(effectTarget)
    ) {
      return false;
    }

    if (anim.playState === "finished" || anim.playState === "idle") {
      return false;
    }

    const timing = anim.effect?.getTiming();
    if (!timing) {
      return true;
    }

    return timing.iterations !== Infinity;
  });

  if (candidates.length === 0) {
    return;
  }

  await Promise.all(
    candidates.map((anim) => anim.finished.catch(() => undefined)),
  );
}
