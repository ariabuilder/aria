/**
 * Page layout mutation policy — structural changes require editPageStructure.
 */

import type { ActionAPIContext } from "astro:actions";
import { requireCapability } from "../auth";
import { normalizePageLayoutRef } from "./layoutPolicy";

export async function assertPageLayoutChangeAllowed(
  context: ActionAPIContext,
  previous: string | null | undefined,
  next: string | null | undefined,
): Promise<void> {
  if (normalizePageLayoutRef(previous) === normalizePageLayoutRef(next)) {
    return;
  }
  await requireCapability(context, "editPageStructure");
}
