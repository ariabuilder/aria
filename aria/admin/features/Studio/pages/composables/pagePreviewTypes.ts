import type { Ref } from "vue";
import type { PagePreviewRenderStylesData } from "./pagePreviewActionResults";

export type ViewportType = string;

export interface PagePreviewFrameProps {
  pageId?: string;
  pageSlug: string;
  pagePath?: string;
  pageStatus?: "draft" | "published" | "archived";
  snapshotUrl?: string;
  thumbnailUrl?: string;
  thumbnailRefreshToken?: string | null;
  snapshotRefreshToken?: string | null;
  inert?: boolean;
  itemType?: "page" | "component";
  class?: string;
  eager?: boolean;
  skipObserver?: boolean;
  viewport?: ViewportType;
  fitToContainer?: boolean;
  thumbnailFit?: "cover" | "contain";
  thumbnailPosition?: "top" | "center";
}

export interface PagePreviewHost {
  iframeSrc: Ref<string>;
  iframeSrcDoc: Ref<string>;
  isRendered: Ref<boolean>;
  hasError: Ref<boolean>;
  isFrameReady: Ref<boolean>;
}

export const EMPTY_PAGE_PREVIEW_RENDER_STYLES: PagePreviewRenderStylesData = {
  baseCSS: "",
  baseCSSHash: "",
  customClassesCSS: "",
  customFontsCSS: "",
  globalCSS: "",
  globalCSSHash: "",
  lastCompiled: "",
  styleRevision: "",
  utilityCSS: "",
  utilityCSSHash: "",
  utilityEngine: "custom",
};
