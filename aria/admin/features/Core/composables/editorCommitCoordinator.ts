import { nextTick } from "vue";

type CommitFlusher = () => void | Promise<void>;

const pendingCommits = new Set<Promise<void>>();
const flushers = new Set<CommitFlusher>();
const commitFailures: Error[] = [];
let mutationLockDepth = 0;

function toCommitError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "Inspector commit failed");
}

/** Track an editor mutation without changing the promise observed by its caller. */
export function trackEditorCommit<T>(
  operation: Promise<T>,
  label = "Inspector change",
): Promise<T> {
  let observed: Promise<void>;
  observed = operation
    .then(
      (value) => {
        if (value === false) {
          commitFailures.push(new Error(`${label} could not be committed`));
        }
      },
      (error: unknown) => {
        commitFailures.push(toCommitError(error));
      },
    )
    .finally(() => {
      pendingCommits.delete(observed);
    });
  pendingCommits.add(observed);
  return operation;
}

export function registerEditorCommitFlusher(
  flusher: CommitFlusher,
): () => void {
  flushers.add(flusher);
  return () => flushers.delete(flusher);
}

async function awaitTrackedCommits(): Promise<void> {
  // Commits may enqueue follow-up mutations, so wait until the set is stable.
  while (pendingCommits.size > 0) {
    await Promise.all([...pendingCommits]);
  }
}

/**
 * Move all visible Inspector state into the authored tree before snapshotting.
 * Save/publish callers must invoke this before consulting dirty state.
 */
export async function settleEditorCommitBarrier(): Promise<void> {
  if (typeof document !== "undefined") {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  }

  await Promise.resolve();
  await nextTick();

  for (const flusher of [...flushers]) {
    await flusher();
  }

  await awaitTrackedCommits();
  await nextTick();

  const failure = commitFailures.shift();
  commitFailures.length = 0;
  if (failure) throw failure;
}

export function hasPendingEditorCommits(): boolean {
  return pendingCommits.size > 0;
}

export function isEditorMutationLocked(): boolean {
  return mutationLockDepth > 0;
}

export function acquireEditorMutationLock(): () => void {
  mutationLockDepth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mutationLockDepth = Math.max(0, mutationLockDepth - 1);
  };
}

/** Test-only reset for the process-wide Composer coordinator. */
export function resetEditorCommitCoordinatorForTests(): void {
  pendingCommits.clear();
  flushers.clear();
  commitFailures.length = 0;
  mutationLockDepth = 0;
}
