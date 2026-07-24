import { z } from "zod";

export const StudioLiveSurfaceSchema = z.enum(["studio", "composer"]);
export const StudioLiveResourceTypeSchema = z.enum([
  "page",
  "component",
  "layout",
]);
export const StudioPresenceStateSchema = z.enum(["viewing", "editing", "away"]);

export const StudioPresenceAttachmentSchema = z.object({
  sessionId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().trim().min(1).max(120),
  avatarUrl: z.url().max(1_024).nullable(),
  surface: StudioLiveSurfaceSchema,
  resourceType: StudioLiveResourceTypeSchema.nullable(),
  resourceId: z.string().trim().min(1).max(255).nullable(),
  state: StudioPresenceStateSchema,
  dirty: z.boolean(),
  connectedAt: z.number().int().nonnegative(),
  lastActivityAt: z.number().int().nonnegative(),
  leaseExpiresAt: z.number().int().nonnegative().nullable(),
});

export type StudioPresenceAttachment = z.infer<
  typeof StudioPresenceAttachmentSchema
>;

export const StudioPresenceUpdateSchema = z.object({
  type: z.literal("presence.update"),
  surface: StudioLiveSurfaceSchema,
  resourceType: StudioLiveResourceTypeSchema.nullable(),
  resourceId: z.string().trim().min(1).max(255).nullable(),
  state: StudioPresenceStateSchema,
  dirty: z.boolean().default(false),
});

export type StudioPresenceUpdate = z.infer<typeof StudioPresenceUpdateSchema>;

export const StudioLiveInvalidationSchema = z.object({
  eventId: z.uuid(),
  siteRevision: z.number().int().nonnegative(),
  resourceType: StudioLiveResourceTypeSchema,
  resourceId: z.string().trim().min(1).max(255),
  scopes: z
    .array(z.enum(["content", "metadata", "policy", "render", "history"]))
    .min(1),
});

export type StudioLiveInvalidation = z.infer<
  typeof StudioLiveInvalidationSchema
>;

export type StudioLiveServerMessage =
  | {
      type: "presence.snapshot";
      sessions: StudioPresenceAttachment[];
      serverTime: number;
    }
  | ({ type: "resource.invalidate" } & StudioLiveInvalidation);

export const StudioPresenceSnapshotSchema = z.object({
  type: z.literal("presence.snapshot"),
  sessions: z.array(StudioPresenceAttachmentSchema),
  serverTime: z.number().int().nonnegative(),
});

export const StudioLiveServerMessageSchema = z.union([
  StudioPresenceSnapshotSchema,
  StudioLiveInvalidationSchema.extend({
    type: z.literal("resource.invalidate"),
  }),
]);

export function resolveEffectivePresence(
  session: StudioPresenceAttachment,
  now: number,
): StudioPresenceAttachment {
  if (
    session.state !== "editing" ||
    session.leaseExpiresAt === null ||
    session.leaseExpiresAt > now
  ) {
    return session;
  }

  return {
    ...session,
    state: "viewing",
    dirty: false,
    leaseExpiresAt: null,
  };
}
