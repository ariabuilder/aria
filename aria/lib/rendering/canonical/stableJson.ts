import { z } from "zod";

import {
  RenderContractError,
  createRenderFailure,
} from "./errors";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>;

export const CanonicalJsonValueSchema: z.ZodType<CanonicalJsonValue> = z.lazy(
  () =>
    z.union([
      z.null(),
      z.boolean(),
      z.number(),
      z.string(),
      z.array(CanonicalJsonValueSchema),
      z.record(z.string(), CanonicalJsonValueSchema),
    ]),
);

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
