import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import {
  ICON_ASSET_BASE_PATH,
  ICON_ASSET_SCHEMA_VERSION,
  ICON_SNAPSHOT_VERSION,
} from "./generatedIconSnapshot";
import {
  isLocalIconPackKey,
  type IconPackKey,
} from "./localIconPackMetadata";

export interface CompiledIconRecord {
  id: string;
  body: string;
  viewBox: string;
  width: number;
  height: number;
  contentHash: string;
  hasInternalIds: boolean;
}

export interface IconSearchItem {
  id: string;
  pack: IconPackKey;
  name: string;
  label: string;
  tags: string[];
}

export interface IconSearchResult {
  items: IconSearchItem[];
  nextCursor: string | null;
  snapshotVersion: string;
}

export interface IconResolveResult {
  icons: Record<string, CompiledIconRecord>;
  missing: string[];
  snapshotVersion: string;
}

export interface IconProvider {
  search(input: {
    pack: IconPackKey;
    q: string;
    limit: number;
    cursor: string | null;
  }): Promise<IconSearchResult>;
  resolve(ids: readonly string[]): Promise<IconResolveResult>;
}

export interface IconProviderReadMetrics {
  assetReads: number;
  manifestReads: number;
  catalogReads: number;
  shardReads: number;
}

export interface IconAssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type ManifestPack = {
  key: IconPackKey;
  catalogPath: string;
  shards: Array<{ key: string; path: string }>;
};

type Manifest = {
  schemaVersion: number;
  snapshotVersion: string;
  packs: Partial<Record<IconPackKey, ManifestPack>>;
};

type CatalogItem = {
  id: string;
  name: string;
  label: string;
  search: string;
  shard: string;
};

type Catalog = { icons: CatalogItem[] };
type Shard = { icons: Record<string, CompiledIconRecord> };

function encodeCursor(offset: number): string {
  return btoa(String(offset));
}

function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const value = Number.parseInt(atob(cursor), 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function joinAssetPath(pathname: string): string {
  return `${ICON_ASSET_BASE_PATH}/${pathname.replace(/^\/+/, "")}`;
}

function isIconAssetFetcher(value: unknown): value is IconAssetFetcher {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { fetch?: unknown }).fetch === "function"
  );
}

/**
 * Reads immutable icon assets through the existing Cloudflare static-assets
 * binding. A `fetcher` can be passed directly for Node development and tests.
 */
export class StaticIconProvider implements IconProvider {
  private manifestPromise: Promise<Manifest> | null = null;
  private readonly catalogPromises = new Map<IconPackKey, Promise<Catalog>>();
  private readonly shardPromises = new Map<string, Promise<Shard>>();
  private readonly metrics: IconProviderReadMetrics = {
    assetReads: 0,
    manifestReads: 0,
    catalogReads: 0,
    shardReads: 0,
  };

  constructor(
    private readonly fetcher: IconAssetFetcher,
    private readonly assetOrigin = "https://aria-icons.invalid",
  ) {}

  async search(input: {
    pack: IconPackKey;
    q: string;
    limit: number;
    cursor: string | null;
  }): Promise<IconSearchResult> {
    const catalog = await this.getCatalog(input.pack);
    const query = input.q.trim().toLowerCase();
    const matching = query
      ? catalog.icons.filter((item) =>
          `${item.name} ${item.label} ${item.search}`.toLowerCase().includes(query),
        )
      : catalog.icons;
    const offset = decodeCursor(input.cursor);
    const items = matching.slice(offset, offset + input.limit).map((item) => ({
      id: item.id,
      pack: input.pack,
      name: item.name,
      label: item.label,
      tags: [],
    }));
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < matching.length ? encodeCursor(nextOffset) : null,
      snapshotVersion: ICON_SNAPSHOT_VERSION,
    };
  }

  async resolve(ids: readonly string[]): Promise<IconResolveResult> {
    const requested = [...new Set(ids)];
    const missing = new Set<string>();
    const catalogByPack = new Map<IconPackKey, Catalog>();
    const itemById = new Map<string, CatalogItem>();

    for (const id of requested) {
      const separator = id.indexOf(":");
      const packValue = separator > 0 ? id.slice(0, separator) : "";
      if (!isLocalIconPackKey(packValue)) {
        missing.add(id);
        continue;
      }
      let catalog = catalogByPack.get(packValue);
      if (!catalog) {
        catalog = await this.getCatalog(packValue);
        catalogByPack.set(packValue, catalog);
      }
      const item = catalog.icons.find((entry) => entry.id === id);
      if (!item) {
        missing.add(id);
        continue;
      }
      itemById.set(id, item);
    }

    const shardKeys = new Set<string>();
    for (const item of itemById.values()) {
      const pack = item.id.slice(0, item.id.indexOf(":")) as IconPackKey;
      shardKeys.add(`${pack}:${item.shard}`);
    }

    const shards = new Map<string, Shard>();
    await Promise.all(
      [...shardKeys].map(async (key) => {
        shards.set(key, await this.getShard(key));
      }),
    );

    const icons: Record<string, CompiledIconRecord> = {};
    for (const [id, item] of itemById) {
      const pack = id.slice(0, id.indexOf(":")) as IconPackKey;
      const icon = shards.get(`${pack}:${item.shard}`)?.icons[id];
      if (icon) {
        icons[id] = icon;
      } else {
        missing.add(id);
      }
    }

    return {
      icons,
      missing: [...missing],
      snapshotVersion: ICON_SNAPSHOT_VERSION,
    };
  }

  getReadMetrics(): IconProviderReadMetrics {
    return { ...this.metrics };
  }

  private async getManifest(): Promise<Manifest> {
    if (!this.manifestPromise) {
      this.metrics.manifestReads++;
      this.manifestPromise = this.readJson<Manifest>("manifest.json").then(
        (manifest) => {
          if (
            manifest.schemaVersion !== ICON_ASSET_SCHEMA_VERSION ||
            manifest.snapshotVersion !== ICON_SNAPSHOT_VERSION
          ) {
            throw new Error("ICON_ASSET_MANIFEST_VERSION_MISMATCH");
          }
          return manifest;
        },
      );
    }
    return this.manifestPromise;
  }

  private async getCatalog(pack: IconPackKey): Promise<Catalog> {
    let catalog = this.catalogPromises.get(pack);
    if (!catalog) {
      this.metrics.catalogReads++;
      catalog = this.getManifest().then(async (manifest) => {
        const packManifest = manifest.packs[pack];
        if (!packManifest) throw new Error(`ICON_PACK_UNAVAILABLE:${pack}`);
        return this.readJson<Catalog>(packManifest.catalogPath);
      });
      this.catalogPromises.set(pack, catalog);
    }
    return catalog;
  }

  private async getShard(key: string): Promise<Shard> {
    let shard = this.shardPromises.get(key);
    if (!shard) {
      this.metrics.shardReads++;
      shard = this.getManifest().then(async (manifest) => {
        const separator = key.indexOf(":");
        const packValue = key.slice(0, separator);
        const shardKey = key.slice(separator + 1);
        if (!isLocalIconPackKey(packValue)) {
          throw new Error(`ICON_PACK_UNAVAILABLE:${packValue}`);
        }
        const path = manifest.packs[packValue]?.shards.find(
          (entry) => entry.key === shardKey,
        )?.path;
        if (!path) throw new Error(`ICON_SHARD_UNAVAILABLE:${key}`);
        return this.readJson<Shard>(path);
      });
      this.shardPromises.set(key, shard);
    }
    return shard;
  }

  private async readJson<T>(path: string): Promise<T> {
    this.metrics.assetReads++;
    const response = await this.fetcher.fetch(
      new Request(new URL(joinAssetPath(path), this.assetOrigin)),
    );
    if (!response.ok) {
      throw new Error(`ICON_ASSET_READ_FAILED:${response.status}:${path}`);
    }
    return (await response.json()) as T;
  }
}

export function createStaticIconProvider(options: {
  locals?: RuntimeLocals;
  fetcher?: IconAssetFetcher;
} = {}): StaticIconProvider | null {
  if (options.fetcher) return new StaticIconProvider(options.fetcher);
  const binding = getCloudflareEnv(options.locals).aria_assets;
  return isIconAssetFetcher(binding)
    ? new StaticIconProvider(binding, options.locals?.assetOrigin)
    : null;
}
