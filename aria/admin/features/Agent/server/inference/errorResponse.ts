import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export function createAgentErrorResponse(message: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        type: "error",
        errorText: message,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
