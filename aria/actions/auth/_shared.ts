/** Internal helpers shared by auth action concerns. */
export function generateId(): string {
  return crypto.randomUUID();
}
