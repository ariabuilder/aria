import { describe, expect, it } from "vitest";

import {
  getTransportErrorCode,
  getTransportErrorMessage,
} from "../../admin/lib/actions/actionResult";

describe("actionResult transport errors", () => {
  it("decodes the render application identity from Astro BAD_REQUEST", () => {
    const result = {
      error: {
        code: "BAD_REQUEST",
        message: "RENDER_INPUT_INVALID: The render input is invalid.",
      },
    };

    expect(getTransportErrorCode(result)).toBe("RENDER_INPUT_INVALID");
    expect(getTransportErrorMessage(result, "Fallback")).toBe(
      "The render input is invalid.",
    );
  });

  it("uses the fallback for empty transport messages", () => {
    expect(
      getTransportErrorMessage(
        { error: { code: "BAD_REQUEST", message: "" } },
        "Fallback",
      ),
    ).toBe("Fallback");
    expect(
      getTransportErrorMessage(
        { error: { code: "BAD_REQUEST", message: "   " } },
        "Fallback",
      ),
    ).toBe("Fallback");
  });

  it("preserves unrelated transport errors", () => {
    const result = {
      error: {
        code: "CONFLICT",
        message: "The draft is stale.",
      },
    };

    expect(getTransportErrorCode(result)).toBe("CONFLICT");
    expect(getTransportErrorMessage(result, "Fallback")).toBe(
      "The draft is stale.",
    );
  });
});
