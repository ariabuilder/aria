import { z } from "zod";
import {
  ICON_SNAPSHOT_VERSION,
  SUPPORTED_ICON_PACKS,
  type IconPackKey,
} from "../../../aria/lib/icons/localIconPackMetadata";

export { ICON_SNAPSHOT_VERSION, SUPPORTED_ICON_PACKS as ICON_PACKS };
export type { IconPackKey };

export const IconPackKeySchema = z.enum(["lucide", "coreui-brands"]);

export const CanonicalIconIdSchema = z.string().regex(
  /^(lucide|coreui-brands):[a-z0-9-]+$/,
  "Invalid canonical icon id",
);

export interface ParsedIconId {
  id: string;
  pack: IconPackKey;
  name: string;
}

export function parseCanonicalIconId(id: string): ParsedIconId | null {
  const parsed = CanonicalIconIdSchema.safeParse(id);
  if (!parsed.success) {
    return null;
  }

  const [packPart, ...nameParts] = parsed.data.split(":");
  const packParse = IconPackKeySchema.safeParse(packPart);
  if (!packParse.success) {
    return null;
  }

  return {
    id: parsed.data,
    pack: packParse.data,
    name: nameParts.join(":"),
  };
}

export function toLabel(iconName: string): string {
  return iconName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
