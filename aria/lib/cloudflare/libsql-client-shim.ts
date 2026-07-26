/**
 * Cloudflare builds must never bundle LibSQL's native Node client. Runtime
 * storage uses D1; reaching this shim means a Node-only fallback escaped its
 * runtime guard.
 */
export function createClient(): never {
  throw new Error(
    "LibSQL is unavailable in the Cloudflare runtime; configure the aria_db D1 binding.",
  );
}
