import { z } from "zod";

export const CanonicalClassOriginSchema = z.enum([
  "utility",
  "custom",
  "runtime",
  "renderer",
  "style-scope",
]);

export type CanonicalClassOrigin = z.infer<typeof CanonicalClassOriginSchema>;

export const CanonicalClassTokenSchema = z
  .object({
    name: z.string().trim().min(1),
    origin: CanonicalClassOriginSchema,
  })
  .strict();

export type CanonicalClassToken = z.infer<typeof CanonicalClassTokenSchema>;

const CLASS_ORIGIN_OUTPUT_ORDER = [
  "utility",
  "custom",
  "runtime",
  "renderer",
  "style-scope",
] as const satisfies readonly CanonicalClassOrigin[];

/** Serializes validated class tokens in the canonical output bands. */
export function serializeCanonicalClassTokens(
  input: readonly CanonicalClassToken[],
): string {
  const tokens = z.array(CanonicalClassTokenSchema).parse(input);
  const seen = new Set<string>();

  return CLASS_ORIGIN_OUTPUT_ORDER.flatMap((origin) =>
    tokens
      .filter((token) => token.origin === origin)
      .filter((token) => {
        if (seen.has(token.name)) return false;
        seen.add(token.name);
        return true;
      })
      .map((token) => token.name),
  ).join(" ");
}
