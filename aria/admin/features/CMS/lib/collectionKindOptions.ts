import { studioIcons } from "@/lib/icons";
import type { CollectionKind } from "../../../../lib/cms/constants";

export interface CollectionKindOption {
  value: CollectionKind;
  label: string;
  description: string;
  icon: string;
}

export const COLLECTION_KIND_OPTIONS: readonly CollectionKindOption[] = [
  {
    value: "content",
    label: "Content",
    description: "Blog posts, articles, and marketing content",
    icon: studioIcons.file,
  },
  {
    value: "data",
    label: "Data",
    description: "Structured data used across the site",
    icon: studioIcons.databaseLine,
  },
  {
    value: "config",
    label: "Config",
    description: "Site-wide configuration settings",
    icon: studioIcons.settings,
  },
  {
    value: "tags",
    label: "Tags",
    description: "Tags, categories, and labels",
    icon: studioIcons.tag,
  },
] as const;
