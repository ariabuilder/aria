import { describe, expect, it } from "vitest";
import { createAgentErrorResponse } from "../../../admin/features/Agent/server/inference/errorResponse";

describe("createAgentErrorResponse", () => {
  it("returns a bounded UI stream containing an error and terminal marker", async () => {
    const response = createAgentErrorResponse(
      "Your agent connection needs to reconnect.",
    );
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"type":"error"');
    expect(body).toContain("Your agent connection needs to reconnect.");
    expect(body).toContain("[DONE]");
  });
});
