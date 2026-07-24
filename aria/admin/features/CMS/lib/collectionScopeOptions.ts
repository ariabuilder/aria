import { studioIcons } from "@/lib/icons";
import type { CollectionScope } from "../../../../lib/cms/constants";

export interface CollectionScopeOption {
  value: CollectionScope;
  label: string;
  description: string;
  icon: string;
}

export const COLLECTION_SCOPE_OPTIONS: readonly CollectionScopeOption[] = [
  {
    value: "global",
    label: "Global",
    description: "Reuse entries anywhere across the site",
    icon: studioIcons.globe,
  },
  {
    value: "collection",
    label: "Local",
    description: "Use entries only on this collection’s pages",
    icon: studioIcons.local,
  },
] as const;
