import { z } from "zod";
import { CanonicalIconIdSchema } from "./reference";
import { createStaticIconProvider, type IconProvider } from "./staticIconProvider";
import { renderIconSvgRecord } from "./renderResolvedIcon";
import type { RuntimeLocals } from "../cloudflare/env";

export const IconSvgRecordSchema = z
  .object({
    svg: z.string().min(1),
    viewBox: z.string().trim().min(1),
    snapshotVersion: z.string().trim().min(1),
  })
  .strict();

export const IconDataResponseSchema = z
  .object({
    icons: z.record(z.string(), IconSvgRecordSchema).optional(),
    missing: z.array(z.string()).optional(),
    snapshotVersion: z.string().trim().min(1).optional(),
  })
  .strict();

export type IconSvgRecord = z.infer<typeof IconSvgRecordSchema>;

export async function fetchIconSvgRecord(
  canonicalId: string,
  options: { locals?: RuntimeLocals; provider?: IconProvider } = {},
): Promise<IconSvgRecord | null> {
  const parsedId = CanonicalIconIdSchema.safeParse(canonicalId);
  if (!parsedId.success) {
    return null;
  }

  const provider =
    options.provider ?? createStaticIconProvider({ locals: options.locals });
  if (!provider) return null;
  const result = await provider.resolve([parsedId.data]);
  const record = result.icons[parsedId.data];
  if (!record) return null;
  return {
    svg: renderIconSvgRecord(record),
    viewBox: record.viewBox,
    snapshotVersion: result.snapshotVersion,
  };
}
