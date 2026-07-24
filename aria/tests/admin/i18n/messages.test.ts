import { describe, expect, it } from "vitest";

import { createStudioI18n } from "../../../admin/i18n";
import {
  EN_MESSAGES,
  FR_MESSAGES,
  getStudioMessage,
} from "../../../admin/i18n/messages";
import {
  EN_FEATURE_MESSAGES,
  FR_FEATURE_MESSAGES,
} from "../../../admin/i18n/messages/registry";

describe("Studio catalogs", () => {
  it("ships a non-empty French translation for every English message key", () => {
    expect(Object.keys(FR_MESSAGES).sort()).toEqual(Object.keys(EN_MESSAGES).sort());
    for (const message of Object.values(FR_MESSAGES)) {
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every extracted feature module aligned between English and French", () => {
    expect(Object.keys(FR_FEATURE_MESSAGES).sort()).toEqual(
      Object.keys(EN_FEATURE_MESSAGES).sort(),
    );

    for (const feature of Object.keys(EN_FEATURE_MESSAGES) as Array<
      keyof typeof EN_FEATURE_MESSAGES
    >) {
      expect(Object.keys(FR_FEATURE_MESSAGES[feature]).sort()).toEqual(
        Object.keys(EN_FEATURE_MESSAGES[feature]).sort(),
      );
    }
  });

  it("does not duplicate keys across extracted feature modules", () => {
    for (const modules of [EN_FEATURE_MESSAGES, FR_FEATURE_MESSAGES]) {
      const keys = Object.values(modules).flatMap((messages) => Object.keys(messages));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("exposes every extracted feature message through the public catalog", () => {
    const extractedEnglishKeys = Object.values(EN_FEATURE_MESSAGES)
      .flatMap((messages) => Object.keys(messages))
      .sort();
    const extractedFrenchKeys = Object.values(FR_FEATURE_MESSAGES)
      .flatMap((messages) => Object.keys(messages))
      .sort();

    expect(Object.keys(EN_MESSAGES).sort()).toEqual(extractedEnglishKeys);
    expect(Object.keys(FR_MESSAGES).sort()).toEqual(extractedFrenchKeys);
  });

  it("switches the document language and interpolates French messages", () => {
    const { api } = createStudioI18n("en");
    api.setLocale("fr");

    expect(document.documentElement.lang).toBe("fr");
    expect(api.t("settings.resetSuccess", { title: "Apparence" })).toBe(
      "Apparence a été réinitialisé",
    );
    expect(api.t("composer.options.showOutlines")).toBe(
      "Afficher les contours",
    );
  });

  it("provides the French public authentication title through the shared catalog", () => {
    expect(getStudioMessage("fr", "auth.forgot.documentTitle")).toBe(
      "Mot de passe oublié - Aria Builder",
    );
  });

  it("labels the collection comments support option", () => {
    expect(getStudioMessage("en", "collections.support.comments")).toBe(
      "Comments",
    );
    expect(getStudioMessage("fr", "collections.support.comments")).toBe(
      "Commentaires",
    );
  });
});
