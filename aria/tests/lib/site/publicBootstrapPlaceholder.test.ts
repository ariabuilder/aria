import { describe, expect, it } from "vitest";

import {
  renderPublicBootstrapPlaceholderHtml,
  renderPublicNotFoundFallbackHtml,
  resolvePublicBootstrapState,
} from "../../../lib/site/publicBootstrapPlaceholder";

describe("resolvePublicBootstrapState", () => {
  it("routes to setup when no admin users exist", () => {
    expect(
      resolvePublicBootstrapState({
        userCount: 0,
        onboarding: { version: 1, status: "complete" },
      }),
    ).toEqual({ ready: false, ctaHref: "/admin/setup" });
  });

  it("routes to admin when users exist but onboarding is incomplete", () => {
    expect(
      resolvePublicBootstrapState({
        userCount: 1,
        onboarding: { version: 1, status: "named" },
      }),
    ).toEqual({ ready: false, ctaHref: "/admin" });

    expect(
      resolvePublicBootstrapState({
        userCount: 1,
        onboarding: null,
      }),
    ).toEqual({ ready: false, ctaHref: "/admin" });
  });

  it("marks the public site ready after onboarding completes", () => {
    expect(
      resolvePublicBootstrapState({
        userCount: 1,
        onboarding: { version: 1, status: "complete" },
      }),
    ).toEqual({ ready: true });
  });
});

describe("public bootstrap HTML", () => {
  it("renders a setup CTA for first-admin installs", () => {
    const html = renderPublicBootstrapPlaceholderHtml({
      ctaHref: "/admin/setup",
    });
    expect(html).toContain("Set up your system");
    expect(html).toContain('href="/admin/setup"');
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).toContain('class="auth-shell"');
    expect(html).toContain('class="auth-dot-grid-backdrop"');
    expect(html).toContain('class="corner corner-tl"');
    expect(html).toContain("Aria Builder");
    expect(html).toContain("Version 0.5.7");
    expect(html).toContain("Aria Builder isn’t set up yet");
    expect(html).toContain("Create your first admin account to start onboarding.");
    expect(html).not.toContain('class="eyebrow"');
    expect(html).toContain('font-family: "Outfit"');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('a.cta:focus-visible');
  });

  it("renders a continue-setup CTA when onboarding is unfinished", () => {
    const html = renderPublicBootstrapPlaceholderHtml({
      ctaHref: "/admin",
    });
    expect(html).toContain("Continue setup");
    expect(html).toContain('href="/admin"');
  });

  it("renders a branded not-found fallback with a home link", () => {
    const html = renderPublicNotFoundFallbackHtml({ pathname: "/missing" });
    expect(html).toContain("Page not found");
    expect(html).toContain("/missing");
    expect(html).toContain('href="/"');
    expect(html).toContain("Back home");
  });
});
