export { ICON_SNAPSHOT_VERSION } from "./generatedIconSnapshot";

export const SUPPORTED_ICON_PACKS = {
  lucide: {
    key: "lucide",
    label: "Lucide",
    category: "icon",
  },
  "coreui-brands": {
    key: "coreui-brands",
    label: "CoreUI Brands",
    category: "brand",
  },
} as const;

export type IconPackKey = keyof typeof SUPPORTED_ICON_PACKS;

export function getLocalIconPackKeys(): IconPackKey[] {
  return Object.keys(SUPPORTED_ICON_PACKS) as IconPackKey[];
}

export function isLocalIconPackKey(value: string): value is IconPackKey {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_ICON_PACKS, value);
}
