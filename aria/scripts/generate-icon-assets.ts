/**
 * Compile supported Iconify collections into immutable static assets.
 * This is intentionally a Node-only build script.
 */

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { icons as cibIcons } from "@iconify-json/cib";
import { icons as lucideIcons } from "@iconify-json/lucide";
import { getIconData, iconToSVG } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const publicRoot = path.join(workspaceRoot, "public", "vendor", "aria-icons", "v1");
const generatedSnapshotPath = path.join(
  workspaceRoot,
  "aria",
  "lib",
  "icons",
  "generatedIconSnapshot.ts",
);
const schemaVersion = 1;
const targetShardBytes = 56 * 1024;
// This logo expands to roughly 144 KB of SVG path data by itself. It is not
// useful in the builder's supported icon set, so exclude it rather than
// shipping a shard that defeats the asset-size bound.
const excludedIconIds = new Set(["coreui-brands:elsevier"]);

type PackKey = "lucide" | "coreui-brands";

type CompiledIconRecord = {
  id: string;
  body: string;
  viewBox: string;
  width: number;
  height: number;
  contentHash: string;
  hasInternalIds: boolean;
};

type CatalogItem = {
  id: string;
  name: string;
  label: string;
  search: string;
  shard: string;
};

type PackBuild = {
  key: PackKey;
  label: string;
  category: "icon" | "brand";
  collection: IconifyJSON;
};

const packs: PackBuild[] = [
  {
    key: "lucide",
    label: "Lucide",
    category: "icon",
    collection: lucideIcons,
  },
  {
    key: "coreui-brands",
    label: "CoreUI Brands",
    category: "brand",
    collection: cibIcons,
  },
];

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toLabel(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toShardStem(firstName: string, lastName: string, index: number): string {
  const start = firstName.slice(0, 2).replace(/[^a-z0-9]/g, "x") || "x";
  const end = lastName.slice(0, 2).replace(/[^a-z0-9]/g, "x") || "x";
  return `${String(index).padStart(3, "0")}-${start}-${end}`;
}

function compilePack(pack: PackBuild): CompiledIconRecord[] {
  const names = Array.from(
    new Set([
      ...Object.keys(pack.collection.icons ?? {}),
      ...Object.keys(pack.collection.aliases ?? {}),
    ]),
  ).sort();

  return names.flatMap((name) => {
    const id = `${pack.key}:${name}`;
    if (excludedIconIds.has(id)) return [];

    const icon = getIconData(pack.collection, name);
    if (!icon) return [];

    const rendered = iconToSVG(icon);
    const viewBox = rendered.attributes.viewBox;
    if (typeof viewBox !== "string") return [];

    const width = Number(icon.width ?? pack.collection.width ?? 24);
    const height = Number(icon.height ?? pack.collection.height ?? 24);
    return [
      {
        id,
        body: rendered.body,
        viewBox,
        width: Number.isFinite(width) ? width : 24,
        height: Number.isFinite(height) ? height : 24,
        contentHash: sha256(`${viewBox}\u0000${rendered.body}`).slice(0, 20),
        hasInternalIds: /(?:\sid=|url\(#|href="#)/u.test(rendered.body),
      },
    ];
  });
}

function shardRecords(records: CompiledIconRecord[]): CompiledIconRecord[][] {
  const shards: CompiledIconRecord[][] = [];
  let active: CompiledIconRecord[] = [];

  for (const record of records) {
    const candidate = [...active, record];
    // The budget must reflect the actual pretty-printed JSON uploaded as a
    // static asset, including repeated record IDs used as object keys.
    if (
      active.length > 0 &&
      Buffer.byteLength(serializeShard(candidate)) > targetShardBytes
    ) {
      shards.push(active);
      active = [];
    }
    active.push(record);
  }

  if (active.length > 0) shards.push(active);
  return shards;
}

function serializeShard(records: CompiledIconRecord[]): string {
  return stableJson({
    icons: Object.fromEntries(records.map((record) => [record.id, record])),
  });
}

async function main(): Promise<void> {
  const compiled = packs.map((pack) => ({
    pack,
    records: compilePack(pack),
  }));
  const snapshotInput = compiled.map(({ pack, records }) => ({
    pack: pack.key,
    records: records.map(({ id, contentHash }) => ({ id, contentHash })),
  }));
  const snapshot = sha256(stableJson(snapshotInput)).slice(0, 20);
  const outputRoot = path.join(publicRoot, snapshot);

  // A deployment is atomic, so only the snapshot referenced by the generated
  // module needs to be packaged. Pruning prevents source/build accumulation.
  await rm(publicRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const manifestPacks: Record<PackKey, unknown> = {} as Record<PackKey, unknown>;
  for (const { pack, records } of compiled) {
    const packRoot = path.join(outputRoot, "packs", pack.key);
    const shardsRoot = path.join(packRoot, "shards");
    await mkdir(shardsRoot, { recursive: true });

    const catalog: CatalogItem[] = [];
    const shardEntries: Array<{ key: string; path: string; hash: string; count: number }> = [];

    for (const [index, shard] of shardRecords(records).entries()) {
      const key = toShardStem(shard[0]!.id.split(":")[1]!, shard.at(-1)!.id.split(":")[1]!, index);
      const fileContents = serializeShard(shard);
      const shardBytes = Buffer.byteLength(fileContents);
      if (shardBytes > targetShardBytes && shard.length > 1) {
        throw new Error(`ICON_SHARD_TARGET_EXCEEDED:${pack.key}:${key}`);
      }
      if (shardBytes > targetShardBytes) {
        throw new Error(`ICON_SHARD_TARGET_EXCEEDED:${pack.key}:${key}`);
      }
      const hash = sha256(fileContents).slice(0, 16);
      const fileName = `${key}.${hash}.json`;
      const relativePath = `packs/${pack.key}/shards/${fileName}`;
      await writeFile(path.join(outputRoot, relativePath), fileContents, "utf8");
      shardEntries.push({ key, path: relativePath, hash, count: shard.length });

      for (const record of shard) {
        const name = record.id.slice(pack.key.length + 1);
        catalog.push({
          id: record.id,
          name,
          label: toLabel(name),
          search: name.replace(/-/g, " "),
          shard: key,
        });
      }
    }

    const catalogContents = stableJson({ icons: catalog });
    const catalogHash = sha256(catalogContents).slice(0, 16);
    const catalogPath = `packs/${pack.key}/catalog.${catalogHash}.json`;
    await writeFile(path.join(outputRoot, catalogPath), catalogContents, "utf8");

    manifestPacks[pack.key] = {
      key: pack.key,
      label: pack.label,
      category: pack.category,
      catalogPath,
      catalogHash,
      iconCount: records.length,
      shards: shardEntries,
    };
  }

  const manifest = {
    schemaVersion,
    snapshotVersion: snapshot,
    packs: manifestPacks,
  };
  await writeFile(path.join(outputRoot, "manifest.json"), stableJson(manifest), "utf8");

  const generatedModule = `/** Generated by npm run build:icons. */\nexport const ICON_ASSET_SCHEMA_VERSION = ${schemaVersion} as const;\nexport const ICON_SNAPSHOT_VERSION = "${snapshot}" as const;\nexport const ICON_ASSET_BASE_PATH = "/vendor/aria-icons/v1/${snapshot}" as const;\n`;
  await writeFile(generatedSnapshotPath, generatedModule, "utf8");

  console.log(
    `Generated ${compiled.reduce((count, value) => count + value.records.length, 0)} icons in ${outputRoot} (all shards at or below ${targetShardBytes} bytes).`,
  );
}

await main();
