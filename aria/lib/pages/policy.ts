import { z } from "zod";

import { hashPassword } from "../auth/password";
import type { AstroCookies, CookieOptions } from "../auth/session";
import {
  StoredPageAccessModeSchema,
  type StoredPageAccessSession,
  StoredPagePolicySchema,
  StoredPageSystemRoleSchema,
  type StoredPagePolicy,
} from "../storage/adapter";
import {
  isCmsEntryDirectRouteBlocked,
  PagePolicyRouteContextSchema,
  resolveCmsPageRoleAccessMode,
  type PagePolicyRouteContext,
} from "./cmsTemplatePolicy";

export { PagePolicyRouteContextSchema, type PagePolicyRouteContext };

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PagePolicyResultSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    systemRole: StoredPageSystemRoleSchema,
    accessMode: StoredPageAccessModeSchema,
    promptTitle: z.string().trim().min(1).optional(),
    promptDescription: z.string().trim().min(1).optional(),
    rememberForDays: z.int().min(1).max(30).optional(),
    hasPassword: z.boolean(),
    policyVersion: z.int().positive(),
    clearedAssignments: z
      .array(
        z
          .object({
            collectionLabel: z.string().trim().min(1),
            field: z.enum(["templatePageId", "listPageId"]),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type PagePolicyResult = z.infer<typeof PagePolicyResultSchema>;

export const VerifyPageAccessPasswordResultSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();

export type VerifyPageAccessPasswordResult = z.infer<
  typeof VerifyPageAccessPasswordResultSchema
>;

export const PagePolicyRouteModeSchema = z.enum([
  "render-page",
  "render-password-gate",
  "rewrite-404",
]);

export type PagePolicyRouteMode = z.infer<typeof PagePolicyRouteModeSchema>;

export const PagePolicyCacheProfileSchema = z.enum([
  "public-ssr",
  "preview",
  "vary-cookie",
]);

export type PagePolicyCacheProfile = z.infer<
  typeof PagePolicyCacheProfileSchema
>;

export const PagePolicyRouteDecisionSchema = z
  .object({
    mode: PagePolicyRouteModeSchema,
    cacheProfile: PagePolicyCacheProfileSchema,
    usePublicCacheTags: z.boolean(),
  })
  .strict();

export type PagePolicyRouteDecision = z.infer<
  typeof PagePolicyRouteDecisionSchema
>;

export const PagePolicyValidationErrorCodeSchema = z.enum([
  "PASSWORD_REQUIRED",
  "PASSWORD_REPLACEMENT_REQUIRED",
  "CMS_PAGE_ROLE_INVALID",
]);

export type PagePolicyValidationErrorCode = z.infer<
  typeof PagePolicyValidationErrorCodeSchema
>;

export class PagePolicyValidationError extends Error {
  readonly code: PagePolicyValidationErrorCode;

  constructor(code: PagePolicyValidationErrorCode, message: string) {
    super(message);
    this.name = "PagePolicyValidationError";
    this.code = code;
  }
}

export interface ResolvePagePolicyUpdateInput {
  systemRole: z.infer<typeof StoredPageSystemRoleSchema>;
  accessMode: z.infer<typeof StoredPageAccessModeSchema>;
  newPassword?: string;
  clearPassword?: boolean;
  promptTitle?: string;
  promptDescription?: string;
  rememberForDays?: number | null;
}

export interface ResolvedPagePolicyUpdate {
  systemRole: z.infer<typeof StoredPageSystemRoleSchema>;
  accessMode: z.infer<typeof StoredPageAccessModeSchema>;
  accessPasswordHash: string | null;
  accessPromptTitle: string | null;
  accessPromptDescription: string | null;
  accessRememberForDays: number | null;
  accessPolicyVersion: number;
  accessDecisionChanged: boolean;
  shouldDeleteExistingSessions: boolean;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequestedPassword(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizePagePolicy(policy: StoredPagePolicy): PagePolicyResult {
  const parsed = StoredPagePolicySchema.parse(policy);

  return PagePolicyResultSchema.parse({
    id: parsed.id,
    slug: parsed.slug,
    systemRole: parsed.systemRole,
    accessMode: parsed.accessMode,
    promptTitle: parsed.accessPromptTitle ?? undefined,
    promptDescription: parsed.accessPromptDescription ?? undefined,
    rememberForDays: parsed.accessRememberForDays ?? undefined,
    hasPassword:
      typeof parsed.accessPasswordHash === "string" &&
      parsed.accessPasswordHash.trim().length > 0,
    policyVersion: parsed.accessPolicyVersion,
  });
}

export async function resolvePagePolicyUpdate(input: {
  existingPolicy: StoredPagePolicy;
  nextPolicy: ResolvePagePolicyUpdateInput;
}): Promise<ResolvedPagePolicyUpdate> {
  const existingPolicy = StoredPagePolicySchema.parse(input.existingPolicy);
  const systemRole = StoredPageSystemRoleSchema.parse(input.nextPolicy.systemRole);
  const accessMode = resolveCmsPageRoleAccessMode(
    systemRole,
    StoredPageAccessModeSchema.parse(input.nextPolicy.accessMode),
  );
  const newPassword = normalizeRequestedPassword(input.nextPolicy.newPassword);
  const clearPassword = input.nextPolicy.clearPassword === true;

  let accessPasswordHash = existingPolicy.accessPasswordHash;
  if (accessMode === "password") {
    if (newPassword) {
      accessPasswordHash = await hashPassword(newPassword);
    } else if (clearPassword) {
      throw new PagePolicyValidationError(
        "PASSWORD_REPLACEMENT_REQUIRED",
        "Password-protected pages require a replacement password when clearing the current password.",
      );
    } else if (!existingPolicy.accessPasswordHash) {
      throw new PagePolicyValidationError(
        "PASSWORD_REQUIRED",
        "Password-protected pages require a password.",
      );
    }
  } else {
    accessPasswordHash = null;
  }

  const accessPromptTitle =
    accessMode === "password"
      ? input.nextPolicy.promptTitle === undefined
        ? existingPolicy.accessPromptTitle
        : normalizeOptionalText(input.nextPolicy.promptTitle)
      : null;
  const accessPromptDescription =
    accessMode === "password"
      ? input.nextPolicy.promptDescription === undefined
        ? existingPolicy.accessPromptDescription
        : normalizeOptionalText(input.nextPolicy.promptDescription)
      : null;
  const accessRememberForDays =
    accessMode === "password"
      ? input.nextPolicy.rememberForDays === undefined
        ? existingPolicy.accessRememberForDays
        : input.nextPolicy.rememberForDays
      : null;

  const accessDecisionChanged =
    existingPolicy.systemRole !== systemRole ||
    existingPolicy.accessMode !== accessMode ||
    existingPolicy.accessPasswordHash !== accessPasswordHash;

  return {
    systemRole,
    accessMode,
    accessPasswordHash,
    accessPromptTitle,
    accessPromptDescription,
    accessRememberForDays,
    accessPolicyVersion: accessDecisionChanged
      ? existingPolicy.accessPolicyVersion + 1
      : existingPolicy.accessPolicyVersion,
    accessDecisionChanged,
    shouldDeleteExistingSessions: accessDecisionChanged,
  };
}

export function buildPageAccessCookieName(pageId: string): string {
  return `aria_page_access_${pageId}`;
}

export function buildPageAccessCookieOptions(
  rememberForDays: number | null | undefined,
): CookieOptions {
  const secure =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.PROD
      : true;

  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    ...(typeof rememberForDays === "number"
      ? { maxAge: Math.max(1, Math.trunc(rememberForDays)) * 24 * 60 * 60 }
      : {}),
  };
}

export function setPageAccessCookie(input: {
  cookies: AstroCookies;
  pageId: string;
  token: string;
  rememberForDays?: number | null;
}): void {
  input.cookies.set(
    buildPageAccessCookieName(input.pageId),
    input.token,
    buildPageAccessCookieOptions(input.rememberForDays),
  );
}

export function clearPageAccessCookie(input: {
  cookies: AstroCookies;
  pageId: string;
}): void {
  input.cookies.delete(buildPageAccessCookieName(input.pageId), {
    path: "/",
  });
}

export function resolvePageAccessSessionExpiry(
  rememberForDays: number | null | undefined,
  nowMs: number = Date.now(),
): string {
  const durationMs =
    typeof rememberForDays === "number"
      ? Math.max(1, Math.trunc(rememberForDays)) * MS_PER_DAY
      : DEFAULT_SESSION_TTL_MS;

  return new Date(nowMs + durationMs).toISOString();
}

export function isPageAccessSessionExpired(
  expiresAt: string,
  nowMs: number = Date.now(),
): boolean {
  return new Date(expiresAt).getTime() <= nowMs;
}

export function hasValidPageAccessSession(input: {
  policy: StoredPagePolicy;
  session: StoredPageAccessSession | null;
  nowMs?: number;
}): boolean {
  const policy = StoredPagePolicySchema.parse(input.policy);
  const session = input.session;

  if (!session) {
    return false;
  }

  if (session.pageId !== policy.id) {
    return false;
  }

  if (session.policyVersion !== policy.accessPolicyVersion) {
    return false;
  }

  return !isPageAccessSessionExpired(session.expiresAt, input.nowMs);
}

export function evaluatePagePolicyRoute(input: {
  policy: StoredPagePolicy;
  isAuthenticatedPreview: boolean;
  hasValidPasswordGrant: boolean;
  routeContext?: PagePolicyRouteContext;
}): PagePolicyRouteDecision {
  const policy = StoredPagePolicySchema.parse(input.policy);
  const routeContext = PagePolicyRouteContextSchema.parse(
    input.routeContext ?? "direct",
  );

  if (input.isAuthenticatedPreview) {
    return PagePolicyRouteDecisionSchema.parse({
      mode: "render-page",
      cacheProfile: "preview",
      usePublicCacheTags: false,
    });
  }

  if (
    isCmsEntryDirectRouteBlocked({
      systemRole: policy.systemRole,
      routeContext,
      isAuthenticatedPreview: input.isAuthenticatedPreview,
    })
  ) {
    return PagePolicyRouteDecisionSchema.parse({
      mode: "rewrite-404",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });
  }

  if (policy.systemRole === "not-found") {
    return PagePolicyRouteDecisionSchema.parse({
      mode: "rewrite-404",
      cacheProfile: "vary-cookie",
      usePublicCacheTags: false,
    });
  }

  if (routeContext === "cms-entry" && policy.systemRole === "cms-entry") {
    return PagePolicyRouteDecisionSchema.parse({
      mode: "render-page",
      cacheProfile: "public-ssr",
      usePublicCacheTags: true,
    });
  }

  switch (policy.accessMode) {
    case "private":
      return PagePolicyRouteDecisionSchema.parse({
        mode: "rewrite-404",
        cacheProfile: "vary-cookie",
        usePublicCacheTags: false,
      });
    case "password":
      return PagePolicyRouteDecisionSchema.parse({
        mode: input.hasValidPasswordGrant
          ? "render-page"
          : "render-password-gate",
        cacheProfile: "vary-cookie",
        usePublicCacheTags: false,
      });
    case "unlisted":
    case "public":
    default:
      return PagePolicyRouteDecisionSchema.parse({
        mode: "render-page",
        cacheProfile: "public-ssr",
        usePublicCacheTags: true,
      });
  }
}
