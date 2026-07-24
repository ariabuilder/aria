import type { RedirectRule } from "./schemas";
import { normalizeRedirectPath } from "./db";

export function buildNetlifyRedirects(rules: readonly RedirectRule[]): string {
  const lines: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }
    lines.push(
      `${normalizeRedirectPath(rule.fromPath)} ${normalizeRedirectPath(rule.toPath)} ${rule.statusCode}`,
    );
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
