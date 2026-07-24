/**
 * A type-safe wrapper around the View Transition
 * API with support for targeting specific elements.
 */

import { ref, readonly } from "vue";
import { z } from "zod";

const TransitionOptionsSchema = z.object({
  targetSlug: z.string().min(1).max(255).optional().nullable(),
  targetName: z.string().min(1).max(64).optional(),
});

export type ViewTransitionOptions = z.infer<typeof TransitionOptionsSchema>;

interface ViewTransitionLike {
  finished: Promise<void>;
}

const DEFAULT_TARGET_NAME = "edit-target";

const transitionTargetSlug = ref<string | null>(null);
const transitionTargetName = ref<string>(DEFAULT_TARGET_NAME);

function setTargetSlug(slug: string | null, name?: string): void {
  if (!slug) {
    transitionTargetSlug.value = null;
    if (name) transitionTargetName.value = name;
    return;
  }

  const parsed = TransitionOptionsSchema.safeParse({
    targetSlug: slug,
    targetName: name,
  });

  if (!parsed.success) {
    console.warn("[ViewTransitions] Invalid target", parsed.error);
    return;
  }

  transitionTargetSlug.value = parsed.data.targetSlug ?? null;
  if (parsed.data.targetName) {
    transitionTargetName.value = parsed.data.targetName;
  }
}

function clearTarget(): void {
  transitionTargetSlug.value = null;
}

function hasViewTransitionSupport(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === "function"
  );
}

async function startViewTransition(
  callback: () => void | Promise<void>,
  options?: ViewTransitionOptions,
): Promise<void> {
  const parsed = TransitionOptionsSchema.safeParse(options ?? {});
  const targetSlug = parsed.success ? parsed.data.targetSlug : null;
  const targetName = parsed.success ? parsed.data.targetName : undefined;

  if (targetSlug) setTargetSlug(targetSlug, targetName);

  if (hasViewTransitionSupport()) {
    const transition = (
      document as Document & {
        startViewTransition: (
          cb: () => void | Promise<void>,
        ) => ViewTransitionLike;
      }
    ).startViewTransition(() => Promise.resolve(callback()));

    await transition.finished.finally(() => {
      clearTarget();
    });
    return;
  }

  await Promise.resolve(callback());
  clearTarget();
}

export function useViewTransitions() {
  return {
    transitionTargetSlug: readonly(transitionTargetSlug),
    transitionTargetName: readonly(transitionTargetName),
    setTargetSlug,
    clearTarget,
    startViewTransition,
    hasViewTransitionSupport,
  };
}
