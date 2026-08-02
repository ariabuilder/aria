import type { ActionAPIContext } from "astro:actions";
import type { z } from "zod";

type ActionInput<TAction> = TAction extends {
  __internalInfer: infer TSchema extends z.ZodType;
}
  ? z.infer<TSchema>
  : undefined;

type ActionOutput<TAction> = TAction extends {
  orThrow: (...args: never[]) => Promise<infer TOutput>;
}
  ? TOutput
  : never;

type TestActionHandler<TAction> = (
  input: ActionInput<TAction>,
  context: Pick<ActionAPIContext, "locals"> & Partial<ActionAPIContext>,
) => Promise<ActionOutput<TAction>>;

/** Exposes Astro's server-only handler while preserving client-inferred I/O. */
export function getActionHandler<TAction>(
  action: TAction,
): TestActionHandler<TAction> {
  const candidate = action as unknown as { handler?: unknown };
  if (typeof candidate.handler !== "function") {
    throw new TypeError("Expected an Astro server action with a handler");
  }

  const handler = candidate.handler as (
    input: ActionInput<TAction>,
    context: ActionAPIContext,
  ) => ActionOutput<TAction> | Promise<ActionOutput<TAction>>;

  return async (input, context) => handler(input, context as ActionAPIContext);
}
