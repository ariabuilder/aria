import { describe, expect, it } from "vitest";

import {
  isFormLifecycleEvent,
  shouldSuppressStageDefaultAction,
} from "../../../admin/features/Stage/interaction/stageActionSafety";

describe("stageActionSafety", () => {
  it.each([
    ["link", "a", "href", "/pricing"],
    ["disabled button", "button", "disabled", ""],
    ["checkbox", "input", "type", "checkbox"],
    ["select", "select", null, null],
    ["summary", "summary", null, null],
    ["controlled video", "video", "controls", ""],
    ["label", "label", "for", "email"],
  ] as const)(
    "suppresses native editor actions without rewriting markup: %s",
    (_name, tagName, attributeName, attributeValue) => {
      const target = document.createElement(tagName);
      if (attributeName !== null && attributeValue !== null) {
        target.setAttribute(attributeName, attributeValue);
      }

      expect(shouldSuppressStageDefaultAction(target)).toBe(true);
    },
  );

  it("allows inert authored elements through the capture boundary", () => {
    const element = document.createElement("div");
    expect(shouldSuppressStageDefaultAction(element)).toBe(false);
  });

  it("classifies form lifecycle events exhaustively", () => {
    expect(isFormLifecycleEvent(new Event("submit"))).toBe(true);
    expect(isFormLifecycleEvent(new Event("reset"))).toBe(true);
    expect(isFormLifecycleEvent(new Event("change"))).toBe(false);
  });
});
