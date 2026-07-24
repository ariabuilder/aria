/**
 * Object utilities for deep merging and manipulation.
 */

/**
 * Deep merge two objects, with source overriding target
 */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer Item>
    ? Array<DeepPartial<Item>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export function mergeDeep<T extends object>(
  target: T,
  source: DeepPartial<T>,
): T {
  const result = { ...(target as Record<string, unknown>) };

  for (const key of Object.keys(source as object) as Array<keyof T>) {
    const sourceValue = source[key];
    if (sourceValue === undefined) continue;

    const stringKey = String(key);
    const targetValue = result[stringKey];

    if (isObject(targetValue) && isObject(sourceValue)) {
      result[stringKey] = mergeDeep(targetValue, sourceValue);
      continue;
    }

    result[stringKey] = sourceValue;
  }

  return result as T;
}

/**
 * Check if a value is a plain object
 */
function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && !Array.isArray(item);
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as T;

  const source = obj as Record<string, unknown>;
  const clonedEntries = Object.entries(source).map(([key, value]) => [
    key,
    deepClone(value),
  ]);

  return Object.fromEntries(clonedEntries) as T;
}
