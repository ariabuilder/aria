import {
  getStringRuntimeSetting,
  type RuntimeLocals,
} from "../../cloudflare/env";

export type WebhookEgressPolicy =
  | { mode: "allowlist"; hosts: readonly string[] }
  | { mode: "proxy"; proxyUrl: string }
  | { mode: "loopback-development" };

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/u, "");
}

function matchesHost(hostname: string, rule: string): boolean {
  const normalized = normalizeHostname(rule);
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  return hostname === normalized;
}

export function readWebhookEgressPolicy(
  locals?: RuntimeLocals,
): WebhookEgressPolicy {
  const mode = getStringRuntimeSetting("ARIA_WEBHOOK_EGRESS_MODE", locals);
  if (mode === "allowlist") {
    const hosts = (
      getStringRuntimeSetting("ARIA_WEBHOOK_EGRESS_ALLOWLIST", locals) ?? ""
    )
      .split(",")
      .map((host) => normalizeHostname(host.trim()))
      .filter(Boolean);
    if (hosts.length === 0) throw new Error("WEBHOOK_EGRESS_NOT_READY");
    return { mode, hosts };
  }
  if (mode === "proxy") {
    const proxyUrl = getStringRuntimeSetting(
      "ARIA_WEBHOOK_EGRESS_PROXY_URL",
      locals,
    );
    if (!proxyUrl || new URL(proxyUrl).protocol !== "https:") {
      throw new Error("WEBHOOK_EGRESS_NOT_READY");
    }
    return { mode, proxyUrl };
  }
  if (
    mode === "loopback-development" &&
    getStringRuntimeSetting("NODE_ENV", locals) === "development"
  ) {
    return { mode };
  }
  throw new Error("WEBHOOK_EGRESS_NOT_READY");
}

export function normalizeWebhookUrl(
  rawUrl: string,
  policy: WebhookEgressPolicy,
): string {
  const url = new URL(rawUrl);
  if (url.username || url.password || url.hash) {
    throw new Error("WEBHOOK_URL_INVALID");
  }
  const hostname = normalizeHostname(url.hostname);
  const loopback =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (policy.mode === "loopback-development") {
    if (!loopback || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new Error("WEBHOOK_URL_BLOCKED");
    }
  } else {
    if (url.protocol !== "https:" || loopback) {
      throw new Error("WEBHOOK_URL_BLOCKED");
    }
    if (
      policy.mode === "allowlist" &&
      !policy.hosts.some((rule) => matchesHost(hostname, rule))
    ) {
      throw new Error("WEBHOOK_URL_BLOCKED");
    }
  }
  url.hostname = hostname;
  url.hash = "";
  return url.toString();
}

export function webhookFetchTarget(
  destination: string,
  policy: WebhookEgressPolicy,
): { url: string; headers: Record<string, string> } {
  if (policy.mode !== "proxy") return { url: destination, headers: {} };
  return {
    url: policy.proxyUrl,
    headers: { "X-Aria-Egress-Destination": destination },
  };
}
