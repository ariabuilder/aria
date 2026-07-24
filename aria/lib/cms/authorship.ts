import { z } from "zod";
import { ActorRefSchema, type ActorRef } from "../auth/types";
import {
  AriaEntryAuthorDisplaySchema,
  type AriaEntryAuthorDisplay,
} from "./schemas";

export const CmsActorInputSchema = ActorRefSchema.extend({
  username: z.string().trim().min(1).optional(),
});

export type CmsActorInput = z.infer<typeof CmsActorInputSchema>;

export function cmsActorFromAuthorship(
  actor: ActorRef,
): AriaEntryAuthorDisplay {
  const parsed = CmsActorInputSchema.parse(actor);
  return AriaEntryAuthorDisplaySchema.parse({
    id: parsed.id,
    username: parsed.username ?? parsed.email ?? "Unknown user",
    email: parsed.email,
    avatarUrl: parsed.avatarUrl ?? null,
  });
}
