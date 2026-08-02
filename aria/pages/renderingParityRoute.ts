const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

export function isRenderingParityLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  const withoutIpv6Brackets =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;

  return LOOPBACK_HOSTNAMES.has(withoutIpv6Brackets);
}
