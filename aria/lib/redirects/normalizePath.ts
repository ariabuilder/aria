import type { TrailingSlashPolicy } from "../crawl/schemas";
import type { RedirectRule } from "./schemas";
import { normalizeRedirectPath } from "./db";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeTrailingSlashPath(
  pathname: string,
  policy: TrailingSlashPolicy,
): string | null {
  if (policy === "none" || pathname === "/") {
    return null;
  }

  const hasTrailingSlash = pathname.endsWith("/");
  if (policy === "strip" && hasTrailingSlash) {
    const stripped = pathname.replace(/\/+$/, "");
    return stripped.length > 0 ? stripped : "/";
  }

  if (policy === "add" && !hasTrailingSlash) {
    return `${pathname}/`;
  }

  return null;
}

export function resolveTrailingSlashPolicy(
  policy: TrailingSlashPolicy | undefined,
): TrailingSlashPolicy {
  return policy ?? "strip";
}

export function pathsMatchForRedirect(
  requestPath: string,
  ruleFromPath: string,
): boolean {
  const normalizedRequest = normalizeRedirectPath(requestPath);
  const normalizedRule = normalizeRedirectPath(ruleFromPath);

  if (normalizedRule.includes("*")) {
    const pattern = `^${normalizedRule
      .split("*")
      .map((segment) => escapeRegex(segment))
      .join(".*")}$`;
    return new RegExp(pattern).test(normalizedRequest);
  }

  return normalizedRequest === normalizedRule;
}

export function resolveRedirectTarget(
  rules: readonly RedirectRule[],
  requestPath: string,
): { toPath: string; statusCode: 301 | 302 } | null {
  const normalizedPath = normalizeRedirectPath(requestPath);
  const match = rules.find(
    (rule) => rule.enabled && pathsMatchForRedirect(normalizedPath, rule.fromPath),
  );
  if (!match) {
    return null;
  }
  return {
    toPath: normalizeRedirectPath(match.toPath),
    statusCode: match.statusCode,
  };
}
