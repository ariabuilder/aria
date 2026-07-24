import type { ActionAPIContext } from "astro:actions";

/** Astro marks ActionAPIContext with this symbol (see astro/dist/actions/runtime/server.js). */
const ACTION_API_CONTEXT_SYMBOL = Symbol.for("astro.actionAPIContext");

type AstroActionLike = {
  (this: ActionAPIContext, input: unknown): Promise<unknown>;
  orThrow?: (this: ActionAPIContext, input: unknown) => Promise<unknown>;
  handler?: (input: unknown, context: unknown) => Promise<unknown>;
};

/**
 * Invoke an Astro `defineAction` result from agent tool
 * code. Astro 7 returns a callable with `.
 */
export async function callDefinedAction(
  action: unknown,
  context: ActionAPIContext,
  input: unknown,
): Promise<unknown> {
  Reflect.set(context, ACTION_API_CONTEXT_SYMBOL, true);

  const actionLike = action as AstroActionLike;

  if (typeof actionLike?.orThrow === "function") {
    return actionLike.orThrow.call(context, input);
  }

  if (typeof actionLike?.handler === "function") {
    return actionLike.handler(input, context);
  }

  if (typeof action === "function") {
    return (action as AstroActionLike).call(context, input);
  }

  throw new Error("Invalid action reference: expected Astro defineAction result");
}

/**
 * Adapter for `invokeActionHandlerForTool({ handler })` — binds an Astro
 * action so it receives validated input + ActionAPIContext correctly.
 */
export function asToolActionHandler(action: unknown) {
  return (validated: unknown, actionContext: ActionAPIContext) =>
    callDefinedAction(action, actionContext, validated);
}
