import { describe, expect, it } from "vitest";

import { getStudioMessage } from "../../../admin/i18n/messages";
import { localizeAuthError } from "../../../admin/features/Auth/utils/localizeAuthError";

function translator(locale: "en" | "fr") {
  return (key: Parameters<typeof getStudioMessage>[1], values?: Record<string, string | number>) =>
    getStudioMessage(locale, key, values);
}

describe("localizeAuthError", () => {
  it("translates public action failures and their remaining-attempt count", () => {
    expect(
      localizeAuthError(
        "Invalid username or password (3 attempts remaining)",
        translator("fr"),
      ),
    ).toBe(
      "Le courriel, le nom d'utilisateur ou le mot de passe est incorrect. 3 tentatives restantes.",
    );
  });

  it("does not expose unknown action error text to the visitor", () => {
    expect(localizeAuthError("internal failure", translator("en"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
