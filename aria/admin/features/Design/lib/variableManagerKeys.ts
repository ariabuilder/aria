export function createSequentialDuplicateKey(
  sourceKey: string,
  existingKeys: readonly string[],
): string {
  const normalizedSourceKey = sourceKey.trim();
  const baseKey = normalizedSourceKey.replace(/-\d+$/, "");
  const existingKeySet = new Set(existingKeys);

  let index = 1;
  let nextKey = `${baseKey}-${index}`;

  while (existingKeySet.has(nextKey)) {
    index += 1;
    nextKey = `${baseKey}-${index}`;
  }

  return nextKey;
}
