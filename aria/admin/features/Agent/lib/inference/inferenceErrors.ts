import { InvalidToolInputError, NoSuchToolError } from "ai";

function readNestedMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if ("message" in value && typeof value.message === "string") {
    const message = value.message.trim();
    if (message) {
      return message;
    }
  }

  if ("error" in value) {
    return readNestedMessage(value.error);
  }

  return undefined;
}

export function formatInferenceError(error: unknown): string {
  if (InvalidToolInputError.isInstance(error)) {
    return `${error.toolName}: Tool input was invalid and could not be repaired.`;
  }
  if (NoSuchToolError.isInstance(error)) {
    return `${error.toolName}: The requested tool is unavailable in this context.`;
  }

  if (error instanceof Error) {
    const nested = readNestedMessage(
      "data" in error ? (error as { data?: unknown }).data : undefined,
    );
    if (nested) {
      return nested;
    }

    const responseBody =
      "responseBody" in error
        ? String((error as { responseBody?: unknown }).responseBody ?? "")
        : "";
    if (responseBody.trim()) {
      try {
        const parsed: unknown = JSON.parse(responseBody);
        const parsedMessage = readNestedMessage(parsed);
        if (parsedMessage) {
          return parsedMessage;
        }
      } catch {
        // Fall through to Error.message.
      }
    }

    if (error.message.trim()) {
      return error.message;
    }
  }

  const fallback = readNestedMessage(error);
  if (fallback) {
    return fallback;
  }

  return "Chat request failed";
}
