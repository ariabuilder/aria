import type { ActionAPIContext } from "astro:actions";
import type { RequestRuntimeLocals } from "../../../../../lib/runtime/requestLocals";
import type { AgentToolActionContext } from "./types";

/**
 * Bridge Agent tool context → Astro action context.
 * Injects session user onto locals so requireAuth/requireOperation work
 * in DO/WS paths that lack Astro cookies.
 */
export function toToolActionContext(
  context: AgentToolActionContext,
): ActionAPIContext {
  const locals = context.locals as RequestRuntimeLocals;
  if (context.user) {
    locals.user = context.user;
  }

  return {
    locals,
    request: context.request ?? new Request("https://aria.internal/agent-tool"),
  } as ActionAPIContext;
}
