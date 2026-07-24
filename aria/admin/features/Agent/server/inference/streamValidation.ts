import {
  InferenceStreamChunkSchema,
  type InferenceStreamChunk,
  redactProviderConfig,
} from "../../lib/schemas";

export type StreamValidationResult =
  | { valid: true; chunk: InferenceStreamChunk }
  | { valid: false; error: string; rawBody: string };

/**
 * Validate a single raw stream body against InferenceStreamChunkSchema.
 * Malformed chunks return an error part — the stream continues.
 */
export function validateStreamChunk(
  body: string,
  index: number,
): StreamValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      valid: false,
      error: `Malformed JSON at chunk ${index}`,
      rawBody: body,
    };
  }

  const result = InferenceStreamChunkSchema.safeParse({
    index,
    part: parsed,
  });

  if (result.success) {
    return { valid: true, chunk: result.data };
  }

  return {
    valid: false,
    error: `Invalid stream part at chunk ${index}: ${result.error.issues
      .map((i) => i.message)
      .join(", ")}`,
    rawBody: body,
  };
}

/**
 * Strip API key material from a chunk body for safe logging.
 */
export function sanitiseChunkForLogging(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify(
        redactProviderConfig(parsed as Record<string, unknown>),
      );
    }
  } catch {
    // Not JSON — return as-is
  }
  return body;
}
