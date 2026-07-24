export type {
  MediaAsset,
  MediaAssetType,
  UploadMediaResult,
} from "../composables/mediaActionResults";

export type FontAssetFormat = "woff2" | "woff" | "ttf" | "otf" | "eot";

export interface MediaUsageItem {
  kind:
    | "page"
    | "layout"
    | "component"
    | "cms-entry"
    | "page-locale"
    | "layout-locale"
    | "site-settings"
    | "design-system";
  id: string;
  title: string;
  path: string;
}
