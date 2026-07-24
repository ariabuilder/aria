import { z } from "zod";

import { PasskeyReadinessSchema } from "./setupWizard";

export const MagicLinkAvailabilitySchema = z.enum([
  "disabled",
  "email_unconfigured",
  "coming_soon",
  "ready",
]);
export type MagicLinkAvailability = z.infer<typeof MagicLinkAvailabilitySchema>;

export const LoginShellStateSchema = z
  .object({
    passkeyReadiness: PasskeyReadinessSchema,
    magicLinkAvailability: MagicLinkAvailabilitySchema,
    passwordOptionsOpen: z.boolean(),
    passkeyMessage: z.string().nullable(),
    magicLinkMessage: z.string().nullable(),
  })
  .strict();
export type LoginShellState = z.infer<typeof LoginShellStateSchema>;
