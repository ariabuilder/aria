import type { ActionAPIContext } from "astro:actions";

export type ActionWithHandler<TInput, TResult> = {
  handler: (input: TInput, context: ActionAPIContext) => Promise<TResult>;
};

export async function invokeActionHandler<TInput, TResult>(
  action: ActionWithHandler<TInput, TResult>,
  input: TInput,
  context: ActionAPIContext,
): Promise<TResult> {
  return action.handler(input, context);
}

export function createActionContext(
  overrides: Partial<ActionAPIContext> = {},
): ActionAPIContext {
  return {
    locals: {},
    ...overrides,
  } as ActionAPIContext;
}
