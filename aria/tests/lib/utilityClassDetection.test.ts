import { describe, expect, it } from "vitest";

import {
  isLikelyUtilityClassName,
  matchesUtilityPattern,
} from "../../lib/styles/utilityClassDetection";

describe("isLikelyUtilityClassName", () => {
  it("recognizes standalone border and placeholder color utilities", () => {
    expect(isLikelyUtilityClassName("border")).toBe(true);
    expect(isLikelyUtilityClassName("border-neutral-800")).toBe(true);
    expect(isLikelyUtilityClassName("placeholder-neutral-500")).toBe(true);
  });

  it("recognizes variant-prefixed utilities", () => {
    expect(isLikelyUtilityClassName("dark:bg-neutral-900")).toBe(true);
    expect(isLikelyUtilityClassName("hover:text-white")).toBe(true);
  });

  it("recognizes variant-parent utilities", () => {
    expect(isLikelyUtilityClassName("group")).toBe(true);
    expect(isLikelyUtilityClassName("peer")).toBe(true);
    expect(isLikelyUtilityClassName("group/card")).toBe(true);
  });

  it("does not treat semantic custom classes as utilities", () => {
    expect(isLikelyUtilityClassName("hero-shell")).toBe(false);
    expect(isLikelyUtilityClassName("newsletter-card")).toBe(false);
  });

  it("recognizes negative margin utilities", () => {
    expect(isLikelyUtilityClassName("-mt-4")).toBe(true);
    expect(isLikelyUtilityClassName("-mb-px")).toBe(true);
    expect(isLikelyUtilityClassName("-mx-auto")).toBe(true);
    expect(isLikelyUtilityClassName("-m-0")).toBe(true);
    expect(isLikelyUtilityClassName("-mr-2")).toBe(true);
    expect(isLikelyUtilityClassName("-ml-1")).toBe(true);
    expect(isLikelyUtilityClassName("-my-4")).toBe(true);
  });

  it("recognizes negative padding utilities", () => {
    expect(isLikelyUtilityClassName("-px-4")).toBe(true);
    expect(isLikelyUtilityClassName("-pt-2")).toBe(true);
    expect(isLikelyUtilityClassName("-p-4")).toBe(true);
  });

  it("recognizes negative logical margin utilities", () => {
    expect(isLikelyUtilityClassName("-ms-4")).toBe(true);
    expect(isLikelyUtilityClassName("-me-2")).toBe(true);
  });

  it("recognizes negative scroll spacing utilities", () => {
    expect(isLikelyUtilityClassName("-scroll-mt-8")).toBe(true);
    expect(isLikelyUtilityClassName("-scroll-px-2")).toBe(true);
  });

  it("recognizes negative inset and transform utilities", () => {
    expect(isLikelyUtilityClassName("-top-4")).toBe(true);
    expect(isLikelyUtilityClassName("-inset-x-0")).toBe(true);
    expect(isLikelyUtilityClassName("-translate-x-1")).toBe(true);
    expect(isLikelyUtilityClassName("-rotate-90")).toBe(true);
    expect(isLikelyUtilityClassName("-skew-x-6")).toBe(true);
  });

  it("recognizes breakpoint-prefixed negative utilities", () => {
    expect(isLikelyUtilityClassName("md:-mt-4")).toBe(true);
    expect(isLikelyUtilityClassName("hover:-translate-x-2")).toBe(true);
  });

  it("does not treat arbitrary dashed names as utilities", () => {
    expect(isLikelyUtilityClassName("-hero-shell")).toBe(false);
  });
});

describe("matchesUtilityPattern", () => {
  it("matches positive and negative spacing tokens after variant strip", () => {
    expect(matchesUtilityPattern("mt-4")).toBe(true);
    expect(matchesUtilityPattern("-mt-4")).toBe(true);
  });
});
