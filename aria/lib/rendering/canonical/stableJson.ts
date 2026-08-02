import { z } from "zod";

import { RenderContractError, createRenderFailure } from "./errors";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>;

export const CanonicalJsonValueSchema: z.ZodType<CanonicalJsonValue> =
  z.custom<CanonicalJsonValue>(
    isCanonicalJsonValueGraph,
    "Expected a JSON-compatible value",
  );

function isCanonicalJsonValueGraph(input: unknown): boolean {
  const activeAncestors = new WeakSet<object>();
  const stack: Array<
    { type: "visit"; value: unknown } | { type: "exit"; value: object }
  > = [{ type: "visit", value: input }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    if (frame.type === "exit") {
      activeAncestors.delete(frame.value);
      continue;
    }

    const value = frame.value;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (!value || typeof value !== "object" || activeAncestors.has(value)) {
      return false;
    }

    activeAncestors.add(value);
    stack.push({ type: "exit", value });

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false;
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !("value" in descriptor)) return false;
        stack.push({ type: "visit", value: descriptor.value });
      }
      const extraKeys = Reflect.ownKeys(value).filter(
        (key) =>
          key !== "length" &&
          (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key)),
      );
      if (extraKeys.length > 0) return false;
      continue;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable ||
        descriptor.value === undefined
      ) {
        return false;
      }
      stack.push({ type: "visit", value: descriptor.value });
    }
  }

  return true;
}

/** Validates unknown input at the portable canonical-data boundary. */
export function parseCanonicalJsonValue(input: unknown): CanonicalJsonValue {
  const parsed = CanonicalJsonValueSchema.safeParse(input);
  if (!parsed.success) {
    throw new RenderContractError(
      createRenderFailure("RENDER_INPUT_INVALID", {
        issueCount: parsed.error.issues.length,
      }),
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

/** Serializes validated JSON data with recursive lexical object-key ordering. */
export function stableSerializeJson(input: unknown): string {
  const value = parseCanonicalJsonValue(input);
  return serializeCanonicalValue(value);
}

function serializeCanonicalValue(value: CanonicalJsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (isCanonicalJsonArray(value)) {
    return `[${value.map(serializeCanonicalValue).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${serializeCanonicalValue(value[key] ?? null)}`,
    )
    .join(",")}}`;
}

function isCanonicalJsonArray(
  value: CanonicalJsonValue,
): value is readonly CanonicalJsonValue[] {
  return Array.isArray(value);
}
