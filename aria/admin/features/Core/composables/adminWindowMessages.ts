import { z } from "zod";

export const OpenCommandBarMessageSchema = z
  .object({
    type: z.literal("open-command-bar"),
  })
  .strict();

export const WireframeModeMessageSchema = z
  .object({
    type: z.literal("set-wireframe-mode"),
    payload: z
      .object({
        enabled: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type OpenCommandBarMessage = z.infer<typeof OpenCommandBarMessageSchema>;
export type WireframeModeMessage = z.infer<typeof WireframeModeMessageSchema>;

export function parseOpenCommandBarMessage(
  data: unknown,
): OpenCommandBarMessage | null {
  const parsed = OpenCommandBarMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function createWireframeModeMessage(
  enabled: boolean,
): WireframeModeMessage {
  return WireframeModeMessageSchema.parse({
    type: "set-wireframe-mode",
    payload: { enabled },
  });
}
