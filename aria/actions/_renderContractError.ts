import { ActionError } from "astro:actions";
import { RenderContractError } from "../lib/rendering/canonical";
import { encodeRenderInputInvalidActionMessage } from "../lib/rendering/actionErrorMessage";
import { log } from "../lib/utils/logger";

export interface SafeRenderContractActionError {
  code: "RENDER_INPUT_INVALID";
  message: string;
  context?: Record<string, string | number | boolean | null>;
}

/** Returns the content-free public action shape for canonical input failures. */
export function toSafeRenderContractActionError(
  error: unknown,
): SafeRenderContractActionError | null {
  if (!(error instanceof RenderContractError)) {
    return null;
  }
  return {
    code: "RENDER_INPUT_INVALID",
    message: error.failure.message,
    ...(error.failure.context ? { context: error.failure.context } : {}),
  };
}

export function throwSafeRenderContractActionError(error: unknown): void {
  const safe = toSafeRenderContractActionError(error);
  if (!safe) return;
  log("warn", "Rejected invalid render input", safe.context);
  throw new ActionError({
    code: "BAD_REQUEST",
    message: encodeRenderInputInvalidActionMessage(),
  });
}
