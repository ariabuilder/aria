import type { ActionAPIContext } from "astro:actions";
import type { AriaEntryRecord } from "./schemas";
import {
  invalidateCmsEntryPublicCache,
  type InvalidateCmsEntryCacheInputSchema,
} from "./invalidateEntryCache";
import { getStorageAdapterAsync } from "../storage/getStorageAdapter";
import type { z } from "zod";

type CacheContextSource = Pick<ActionAPIContext, "locals"> | undefined;

export async function invalidateCmsEntryCacheFromAction(
  context: CacheContextSource,
  input: z.input<typeof InvalidateCmsEntryCacheInputSchema>,
): Promise<void> {
  if (!context?.locals) {
    return;
  }
  const adapter = await getStorageAdapterAsync(context.locals);
  await invalidateCmsEntryPublicCache(adapter, { locals: context.locals }, input);
}

export async function invalidateCmsEntryCacheFromRecord(
  context: CacheContextSource,
  record: AriaEntryRecord,
): Promise<void> {
  await invalidateCmsEntryCacheFromAction(context, {
    collectionId: record.entry.collectionId,
    entryId: record.entry.id,
  });
}
