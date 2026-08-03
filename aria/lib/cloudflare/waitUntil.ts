import type { RuntimeLocals } from "./env";

type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

function isWaitUntilContext(value: unknown): value is WaitUntilContext {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { waitUntil?: unknown }).waitUntil === "function"
  );
}

/**
 * Registers non-authoritative work after the Cloudflare response boundary.
 * Returns false in Node/local runtimes so callers can await the same work.
 */
export function deferWithWaitUntil(
  locals: RuntimeLocals | undefined,
  task: Promise<unknown>,
): boolean {
  const context = locals?.cfContext;
  if (!isWaitUntilContext(context)) {
    return false;
  }

  context.waitUntil(task);
  return true;
}
