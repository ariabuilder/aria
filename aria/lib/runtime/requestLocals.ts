import { SessionUserSchema, type SessionUser } from "../auth/types";
import type { RuntimeLocals } from "../cloudflare/env";
import { log } from "../utils/logger";

export type ComposerContext = {
  isComposer: boolean;
  isStage: boolean;
};

export type RequestRuntimeLocals = RuntimeLocals & {
  user?: SessionUser;
  composerContext?: ComposerContext;
};

export function readSessionUserFromLocals(
  locals: RequestRuntimeLocals,
): SessionUser | null {
  const parsed = SessionUserSchema.safeParse(locals.user);

  if (parsed.success) {
    return parsed.data;
  }

  if (typeof locals.user !== "undefined") {
    log("warn", "[requestLocals] Invalid session user on request locals", {
      issues: parsed.error.issues,
    });
    locals.user = undefined;
  }

  return null;
}
