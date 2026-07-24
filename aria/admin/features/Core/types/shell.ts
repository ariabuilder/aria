import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type { AddElementPayload, LayersReorderData } from "../../../types/app";
import type { EditableItemType } from "./router";
import type { StageEditingTab } from "../../Stage/types";

export interface SelectableComponent {
  id?: string;
  slug?: string;
  name: string;
  description?: string;
  category?: string;
  source?: "custom" | "aria";
  tier?: "free" | "pro";
  isLocked?: boolean;
  snapshotUrl?: string | null;
  thumbnailUrl?: string | null;
  updatedAt?: string | null;
}

export interface SelectablePage {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  updatedAt?: string | null;
}

export interface SelectableLayout {
  id: string;
  name: string;
  title?: string;
  description?: string;
  updatedAt?: string | null;
}

export interface AppChromeShellProps {
  isPreview: boolean;
  pickerOpen: boolean;
  components: SelectableComponent[];
}

export interface AppChromeShellListeners {
  "open-settings": () => void;
  "update:picker-open": (value: boolean) => void;
  "select-component": (component: SelectableComponent) => void | Promise<void>;
}

export interface AppLeftSidebarShellProps {
  show: boolean;
  isPreview: boolean;
  isItemTransitioning: boolean;
  open: boolean;
  activeBlocks: BuilderNode[];
  showOutlines: boolean;
  wireframeMode: boolean;
  hasUnsavedChanges: boolean;
  currentItemSlug: string;
  currentItemType: EditableItemType;
  currentLayout: LayoutDSL | null;
  currentPage: PageDSL | null;
  currentComponent: ComponentDSL | null;
  availablePages: SelectablePage[];
  availableLayouts: SelectableLayout[];
  availableComponents: SelectableComponent[];
  editingTab: StageEditingTab;
}

export interface AppLeftSidebarShellListeners {
  "update:open": (value: boolean) => void;
  "update:editing-tab": (value: StageEditingTab) => void;
  "update:show-outlines": (value: boolean) => void;
  "update:wireframe-mode": (value: boolean) => void;
  unpublish: () => void | Promise<void>;
  "select-page": (slug: string) => void;
  "create-page": (slug: string) => void;
  "select-layout": (slug: string) => void;
  "create-layout": (slug: string) => void;
  "select-component": (slug: string) => void;
  "create-component": (slug: string) => void;
  "edit-component": (componentId: string) => void | Promise<void>;
  "update:activeBlocks": (blocks: BuilderNode[]) => void;
  "update-layout": (layoutSlug: string) => void;
  "add-element": (payload: AddElementPayload) => void;
  "reorder-node": (payload: LayersReorderData) => void;
  "open-picker": (slotName: string) => void;
  "page-saved": (page: PageDSL) => void;
  "component-saved": (component: ComponentDSL) => void;
}

export interface AppLeftSidebarShellExpose {
  expandAncestorsInLayers: (nodeId: string) => void;
  openQuickSwitch: () => void;
}
