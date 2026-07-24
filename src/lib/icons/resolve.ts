import type { RuntimeLocals } from "../../../aria/lib/cloudflare/env";
import {
  createStaticIconProvider,
  type IconProvider,
  type IconSearchItem,
} from "../../../aria/lib/icons/staticIconProvider";
import { renderIconSvgRecord } from "../../../aria/lib/icons/renderResolvedIcon";
import { ICON_SNAPSHOT_VERSION } from "../../../aria/lib/icons/generatedIconSnapshot";
import { type IconPackKey, parseCanonicalIconId, toLabel } from "./packs";

export type { IconSearchItem };

export interface IconSearchResult {
  items: IconSearchItem[];
  nextCursor: string | null;
  snapshotVersion: string;
}

export interface ResolvedIconPayload {
  svg: string;
  viewBox: string;
  snapshotVersion: string;
}

export interface ResolveDataResult {
  icons: Record<string, ResolvedIconPayload>;
  missing: string[];
  snapshotVersion: string;
}

/**
 * Tests and Node callers can pass an explicit provider. Worker routes resolve
 * through the existing `aria_assets` static-assets binding.
 */
function resolveProvider(params: {
  locals?: RuntimeLocals;
  provider?: IconProvider;
}): IconProvider | null {
  return params.provider ?? createStaticIconProvider({ locals: params.locals });
}

export async function searchIcons(params: {
  pack: IconPackKey;
  q: string;
  limit: number;
  cursor: string | null;
  locals?: RuntimeLocals;
  provider?: IconProvider;
}): Promise<IconSearchResult> {
  const provider = resolveProvider(params);
  if (!provider) {
    throw new Error("ICON_ASSET_PROVIDER_UNAVAILABLE");
  }
  return provider.search(params);
}

export async function resolveIconData(params: {
  ids: string[];
  locals?: RuntimeLocals;
  provider?: IconProvider;
}): Promise<ResolveDataResult> {
  const provider = resolveProvider(params);
  const invalidIds: string[] = [];
  const ids = params.ids.filter((id) => {
    if (parseCanonicalIconId(id)) return true;
    invalidIds.push(id);
    return false;
  });

  if (!provider) {
    return {
      icons: {},
      missing: [...new Set([...ids, ...invalidIds])],
      snapshotVersion: ICON_SNAPSHOT_VERSION,
    };
  }

  const result = await provider.resolve(ids);
  return {
    icons: Object.fromEntries(
      Object.entries(result.icons).map(([id, icon]) => [
        id,
        {
          svg: renderIconSvgRecord(icon),
          viewBox: icon.viewBox,
          snapshotVersion: result.snapshotVersion,
        },
      ]),
    ),
    missing: [...new Set([...result.missing, ...invalidIds])],
    snapshotVersion: result.snapshotVersion,
  };
}

/** Kept for API consumers that need a stable default snapshot without I/O. */
export const ICON_RESOLVER_SNAPSHOT_VERSION = ICON_SNAPSHOT_VERSION;
export { toLabel };
