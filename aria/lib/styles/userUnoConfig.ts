import { z } from "zod";

export const UserUnoConfigOverridesSchema = z
  .object({
    theme: z.record(z.string(), z.unknown()).optional(),
    shortcuts: z.record(z.string(), z.string()).optional(),
    safelist: z.array(z.string()).optional(),
  })
  .strict();

export type UserUnoConfigOverrides = z.infer<
  typeof UserUnoConfigOverridesSchema
>;

export function parseUserUnoConfigOverrides(
  overrides: unknown,
): UserUnoConfigOverrides {
  const parsed = UserUnoConfigOverridesSchema.safeParse(overrides);
  return parsed.success ? parsed.data : {};
}
