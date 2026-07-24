import { describe, expect, it } from "vitest";

import {
  evaluatePagePolicyRoute,
  hasValidPageAccessSession,
  buildPageAccessCookieName,
  buildPageAccessCookieOptions,
  resolvePageAccessSessionExpiry,
  resolvePagePolicyUpdate,
  sanitizePagePolicy,
} from "../../lib/pages/policy";
import type { StoredPagePolicy } from "../../lib/storage/adapter";

const basePolicy: StoredPagePolicy = {
  id: "page-home",
  slug: "home",
  systemRole: "standard",
  accessMode: "password",
  accessPasswordHash: "salt.hash",
  accessPromptTitle: "Old title",
  accessPromptDescription: "Old description",
  accessRememberForDays: 7,
  accessPolicyVersion: 4,
  publishedVersion: "123",
  updatedAt: "2026-04-28T12:00:00.000Z",
};

describe("page policy helper", () => {
  it("sanitizes stored policy without exposing the hash", () => {
    const result = sanitizePagePolicy(basePolicy);

    expect(result).toEqual({
      id: "page-home",
      slug: "home",
      systemRole: "standard",
      accessMode: "password",
      promptTitle: "Old title",
      promptDescription: "Old description",
      rememberForDays: 7,
      hasPassword: true,
      policyVersion: 4,
    });
    expect(result).not.toHaveProperty("accessPasswordHash");
  });

  it("keeps the existing hash and version when only prompt copy changes", async () => {
    const resolved = await resolvePagePolicyUpdate({
      existingPolicy: basePolicy,
      nextPolicy: {
        systemRole: "standard",
        accessMode: "password",
        promptTitle: "New title",
        promptDescription: "New description",
        rememberForDays: 7,
      },
    });

    expect(resolved).toEqual({
      systemRole: "standard",
      accessMode: "password",
      accessPasswordHash: "salt.hash",
      accessPromptTitle: "New title",
      accessPromptDescription: "New description",
      accessRememberForDays: 7,
      accessPolicyVersion: 4,
      accessDecisionChanged: false,
      shouldDeleteExistingSessions: false,
    });
  });

  it("requires a password when switching a page to password mode for the first time", async () => {
    await expect(
      resolvePagePolicyUpdate({
        existingPolicy: {
          ...basePolicy,
          accessMode: "public",
          accessPasswordHash: null,
          accessPromptTitle: null,
          accessPromptDescription: null,
          accessRememberForDays: null,
        },
        nextPolicy: {
          systemRole: "standard",
          accessMode: "password",
        },
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_REQUIRED",
    });
  });

  it("requires a replacement password when clearing the existing password in password mode", async () => {
    await expect(
      resolvePagePolicyUpdate({
        existingPolicy: basePolicy,
        nextPolicy: {
          systemRole: "standard",
          accessMode: "password",
          clearPassword: true,
          rememberForDays: 7,
        },
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_REPLACEMENT_REQUIRED",
    });
  });

  it("forces not-found pages to public and clears password-only fields", async () => {
    const resolved = await resolvePagePolicyUpdate({
      existingPolicy: basePolicy,
      nextPolicy: {
        systemRole: "not-found",
        accessMode: "private",
        promptTitle: "Should clear",
        rememberForDays: 30,
      },
    });

    expect(resolved).toEqual({
      systemRole: "not-found",
      accessMode: "public",
      accessPasswordHash: null,
      accessPromptTitle: null,
      accessPromptDescription: null,
      accessRememberForDays: null,
      accessPolicyVersion: 5,
      accessDecisionChanged: true,
      shouldDeleteExistingSessions: true,
    });
  });

  it("builds stable cookie names, cookie options, and default expiries", () => {
    expect(buildPageAccessCookieName("page-home")).toBe(
      "aria_page_access_page-home",
    );
    expect(buildPageAccessCookieOptions(3)).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 259200,
      }),
    );
    expect(resolvePageAccessSessionExpiry(null, 0)).toBe(
      "1970-01-08T00:00:00.000Z",
    );
  });

  it("evaluates public route outcomes from the shared policy matrix", () => {
    expect(
      evaluatePagePolicyRoute({
        policy: {
          ...basePolicy,
          accessMode: "public",
          accessPasswordHash: null,
        },
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: false,
      }),
    ).toEqual({
      mode: "render-page",
      cacheProfile: "public-ssr",
      usePublicCacheTags: true,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: basePolicy,
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: false,
      }),
    ).toEqual({
      mode: "render-password-gate",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: basePolicy,
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: true,
      }),
    ).toEqual({
      mode: "render-page",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: {
          ...basePolicy,
          accessMode: "private",
          accessPasswordHash: null,
        },
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: false,
      }),
    ).toEqual({
      mode: "rewrite-404",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: {
          ...basePolicy,
          systemRole: "not-found",
          accessMode: "public",
          accessPasswordHash: null,
        },
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: false,
      }),
    ).toEqual({
      mode: "rewrite-404",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: basePolicy,
        isAuthenticatedPreview: true,
        hasValidPasswordGrant: false,
      }),
    ).toEqual({
      mode: "render-page",
      cacheProfile: "preview",
      usePublicCacheTags: false,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: {
          ...basePolicy,
          systemRole: "cms-entry",
          accessMode: "public",
          accessPasswordHash: null,
        },
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: false,
        routeContext: "direct",
      }),
    ).toEqual({
      mode: "rewrite-404",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });

    expect(
      evaluatePagePolicyRoute({
        policy: {
          ...basePolicy,
          systemRole: "cms-entry",
          accessMode: "public",
          accessPasswordHash: null,
        },
        isAuthenticatedPreview: false,
        hasValidPasswordGrant: false,
        routeContext: "cms-entry",
      }),
    ).toEqual({
      mode: "render-page",
      cacheProfile: "public-ssr",
      usePublicCacheTags: true,
    });
  });

  it("forces cms-entry pages to public and clears password-only fields", async () => {
    const resolved = await resolvePagePolicyUpdate({
      existingPolicy: basePolicy,
      nextPolicy: {
        systemRole: "cms-entry",
        accessMode: "private",
        promptTitle: "Should clear",
        rememberForDays: 30,
      },
    });

    expect(resolved).toEqual({
      systemRole: "cms-entry",
      accessMode: "public",
      accessPasswordHash: null,
      accessPromptTitle: null,
      accessPromptDescription: null,
      accessRememberForDays: null,
      accessPolicyVersion: 5,
      accessDecisionChanged: true,
      shouldDeleteExistingSessions: true,
    });
  });

  it("validates page access sessions against page id, policy version, and expiry", () => {
    expect(
      hasValidPageAccessSession({
        policy: basePolicy,
        session: {
          tokenHash: "token-hash",
          pageId: "page-home",
          policyVersion: 4,
          expiresAt: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-28T00:00:00.000Z",
          lastUsedAt: "2026-04-28T00:00:00.000Z",
        },
        nowMs: Date.parse("2026-04-28T12:00:00.000Z"),
      }),
    ).toBe(true);

    expect(
      hasValidPageAccessSession({
        policy: basePolicy,
        session: {
          tokenHash: "token-hash",
          pageId: "page-home",
          policyVersion: 3,
          expiresAt: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-28T00:00:00.000Z",
          lastUsedAt: "2026-04-28T00:00:00.000Z",
        },
        nowMs: Date.parse("2026-04-28T12:00:00.000Z"),
      }),
    ).toBe(false);

    expect(
      hasValidPageAccessSession({
        policy: basePolicy,
        session: {
          tokenHash: "token-hash",
          pageId: "page-home",
          policyVersion: 4,
          expiresAt: "2026-04-28T11:59:59.000Z",
          createdAt: "2026-04-28T00:00:00.000Z",
          lastUsedAt: "2026-04-28T00:00:00.000Z",
        },
        nowMs: Date.parse("2026-04-28T12:00:00.000Z"),
      }),
    ).toBe(false);
  });
});
