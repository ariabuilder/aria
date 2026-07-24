import { describe, expect, it } from "vitest";
import { resolveUploadsRedirectTarget } from "../../../src/middleware/uploadsRedirect";

describe("middleware uploads redirect", () => {
  it("redirects /uploads file requests to R2_PUBLIC_URL", async () => {
    const target = resolveUploadsRedirectTarget({
      requestUrl: "https://app.example.com/uploads/gallery/hero.jpg?fit=cover",
      r2PublicUrl: "https://r2.ariabuilder.io",
    });

    expect(target?.toString()).toBe(
      "https://r2.ariabuilder.io/gallery/hero.jpg?fit=cover",
    );
  });

  it("does not redirect when R2_PUBLIC_URL is missing", async () => {
    const target = resolveUploadsRedirectTarget({
      requestUrl: "https://app.example.com/uploads/gallery/hero.jpg",
    });
    expect(target).toBeNull();
  });

  it("does not redirect directory-style /uploads paths", async () => {
    const target = resolveUploadsRedirectTarget({
      requestUrl: "https://app.example.com/uploads/gallery/",
      r2PublicUrl: "https://r2.ariabuilder.io",
    });
    expect(target).toBeNull();
  });

  it("falls back to next() for invalid R2_PUBLIC_URL", async () => {
    expect(() =>
      resolveUploadsRedirectTarget({
        requestUrl: "https://app.example.com/uploads/gallery/hero.jpg",
        r2PublicUrl: "not-a-valid-url",
      }),
    ).toThrow();
  });

  it("does not redirect non-uploads paths", async () => {
    const target = resolveUploadsRedirectTarget({
      requestUrl: "https://app.example.com/aria/dashboard",
      r2PublicUrl: "https://r2.ariabuilder.io",
    });

    expect(target).toBeNull();
  });
});
