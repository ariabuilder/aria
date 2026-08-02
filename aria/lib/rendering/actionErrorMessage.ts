export const RENDER_INPUT_INVALID_ACTION_PREFIX = "RENDER_INPUT_INVALID: ";
export const RENDER_INPUT_INVALID_ACTION_MESSAGE = `${RENDER_INPUT_INVALID_ACTION_PREFIX}The render input is invalid.`;

export interface DecodedRenderActionError {
  code: "RENDER_INPUT_INVALID";
  message: string;
}

/** Encodes the application render code inside Astro's fixed error protocol. */
export function encodeRenderInputInvalidActionMessage(): string {
  return RENDER_INPUT_INVALID_ACTION_MESSAGE;
}

/** Recovers the application render code without accepting arbitrary prefixes. */
export function decodeRenderActionErrorMessage(
  message: unknown,
): DecodedRenderActionError | null {
  if (message !== RENDER_INPUT_INVALID_ACTION_MESSAGE) {
    return null;
  }

  return {
    code: "RENDER_INPUT_INVALID",
    message: "The render input is invalid.",
  };
}
