import type { ActionAPIContext } from "astro:actions";
import type { SessionUser } from "../auth/types";
import type { RequestRuntimeLocals } from "../runtime/requestLocals";

const ACTION_API_CONTEXT_SYMBOL = Symbol.for("astro.actionAPIContext");

type DefinedActionLike = {
  (this: ActionAPIContext, input: unknown): Promise<unknown>;
  orThrow?: (this: ActionAPIContext, input: unknown) => Promise<unknown>;
  handler?: (input: unknown, context: ActionAPIContext) => Promise<unknown>;
};

export function createApiActionContext(input: {
  request: Request;
  locals: RequestRuntimeLocals;
  user: SessionUser;
}): ActionAPIContext {
  const context = {
    locals: { ...input.locals, user: input.user },
    request: input.request,
  } as ActionAPIContext;
  Reflect.set(context, ACTION_API_CONTEXT_SYMBOL, true);
  return context;
}

export async function invokeApiAction(
  action: unknown,
  context: ActionAPIContext,
  value: unknown,
): Promise<unknown> {
  const callable = action as DefinedActionLike;
  if (typeof callable?.orThrow === "function") {
    return callable.orThrow.call(context, value);
  }
  if (typeof callable?.handler === "function") {
    return callable.handler(value, context);
  }
  if (typeof callable === "function") return callable.call(context, value);
  throw new Error("Invalid action reference");
}
