import { describe, expect, it } from "vitest";

import { isApiKeyringConfigurationError } from "../../../admin/features/Api/client/apiCredentialErrors";

describe("Site API credential errors", () => {
  it.each([
    "API_KEYRING_KEY_ID_UNAVAILABLE",
    "API_KEYRING_KEY_ID_INVALID",
    "API_KEYRING_KEY_UNAVAILABLE",
    "API_KEYRING_KEY_INVALID",
  ])("recognizes the keyring configuration error %s", (message) => {
    expect(isApiKeyringConfigurationError(new Error(message))).toBe(true);
  });

  it("does not hide unrelated server errors", () => {
    expect(
      isApiKeyringConfigurationError(new Error("Database unavailable")),
    ).toBe(false);
    expect(isApiKeyringConfigurationError("API_KEYRING_KEY_UNAVAILABLE")).toBe(
      false,
    );
  });
});
