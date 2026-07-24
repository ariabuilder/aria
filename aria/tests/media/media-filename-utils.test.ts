import { describe, expect, it } from "vitest";
import { createStoredMediaFilename } from "../../lib/media/utils/filename";

describe("createStoredMediaFilename", () => {
  it("creates readable slug-style names with extension", () => {
    const name = createStoredMediaFilename("My Vacation Photo (Final).JPG");
    expect(name).toMatch(/^my-vacation-photo-final-[a-f0-9]{6}\.jpg$/);
  });

  it("handles unicode and strips diacritics", () => {
    const name = createStoredMediaFilename("Crème brûlée – héro.png");
    expect(name).toMatch(/^creme-brulee-hero-[a-f0-9]{6}\.png$/);
  });

  it("falls back safely when filename is mostly symbols", () => {
    const name = createStoredMediaFilename("***");
    expect(name).toMatch(/^file-[a-f0-9]{6}$/);
  });
});
