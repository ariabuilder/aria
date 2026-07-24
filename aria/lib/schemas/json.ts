import { z } from "zod";

import type { JsonObject, JsonValue } from "../types/nodes";

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  JsonValueSchema,
);

/**
 * Serialize for storage/API payloads. JSON round-trip drops keys whose values are
 * `undefined`; JsonValueSchema rejects explicit `undefined` on object properties.
 */
export function toStorableJsonObject(value: unknown): JsonObject {
  return JsonObjectSchema.parse(JSON.parse(JSON.stringify(value)));
}
