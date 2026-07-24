/**
 * Isomorphic ID generation — browser, Node, and Cloudflare Workers. Uses the Web Crypto API (`crypto.
 * @see aria/lib/README.md
 */

export function generateId(): string {
  return crypto.randomUUID();
}
