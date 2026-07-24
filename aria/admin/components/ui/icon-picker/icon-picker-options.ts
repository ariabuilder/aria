export interface IconPickerOption {
  value: string;
  label: string;
  tags?: string[];
}

export interface IconPickerGroup {
  id: string;
  label: string;
  icons: IconPickerOption[];
}

export const ICON_PICKER_GROUPS: IconPickerGroup[] = [
  {
    id: "general",
    label: "General",
    icons: [
      { value: "i-hugeicons:star", label: "Star", tags: ["favorite"] },
      {
        value: "i-hugeicons:checkmark-circle-02",
        label: "Check Circle",
        tags: ["success"],
      },
      {
        value: "i-hugeicons:cancel-circle",
        label: "Close Circle",
        tags: ["error"],
      },
      {
        value: "i-hugeicons:alert-01",
        label: "Warning",
        tags: ["alert"],
      },
      {
        value: "i-hugeicons:notification-01",
        label: "Bell",
        tags: ["notification"],
      },
      {
        value: "i-hugeicons:settings-01",
        label: "Settings",
        tags: ["config"],
      },
      {
        value: "i-hugeicons:magic-wand-01",
        label: "Magic",
        tags: ["spark", "ai"],
      },
      {
        value: "i-hugeicons:rocket-01",
        label: "Rocket",
        tags: ["launch"],
      },
    ],
  },
  {
    id: "actions",
    label: "Actions",
    icons: [
      {
        value: "i-hugeicons:add-circle",
        label: "Add Circle",
        tags: ["plus", "create"],
      },
      {
        value: "i-hugeicons:add-square",
        label: "Add Square",
        tags: ["plus", "create"],
      },
      {
        value: "i-hugeicons:arrow-right-01",
        label: "Arrow Right",
        tags: ["next"],
      },
      {
        value: "i-hugeicons:arrow-right-01",
        label: "Arrow Right Alt",
        tags: ["next"],
      },
      {
        value: "i-hugeicons:arrow-up-right-01",
        label: "Arrow Right Up",
        tags: ["external", "link"],
      },
      {
        value: "i-hugeicons:copy-01",
        label: "Copy",
        tags: ["duplicate"],
      },
      { value: "i-hugeicons:pen-01", label: "Edit", tags: ["pencil"] },
      {
        value: "i-hugeicons:delete-02",
        label: "Trash",
        tags: ["delete", "remove"],
      },
      { value: "i-hugeicons:upload-01", label: "Upload", tags: ["file"] },
      {
        value: "i-hugeicons:arrow-down-01",
        label: "Download",
        tags: ["file"],
      },
      {
        value: "i-hugeicons:refresh",
        label: "Refresh",
        tags: ["reload"],
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    icons: [
      {
        value: "i-hugeicons:file-01",
        label: "Document",
        tags: ["page", "text"],
      },
      {
        value: "i-hugeicons:browser",
        label: "Layout",
        tags: ["window", "frame"],
      },
      {
        value: "i-hugeicons:component",
        label: "Widget",
        tags: ["component", "block"],
      },
      {
        value: "i-hugeicons:layout-grid",
        label: "Widgets",
        tags: ["component", "block"],
      },
      {
        value: "i-hugeicons:cursor-text",
        label: "Text",
        tags: ["typography"],
      },
      {
        value: "i-hugeicons:colors",
        label: "Palette",
        tags: ["color", "design"],
      },
      {
        value: "i-hugeicons:paint-board",
        label: "Palette 2",
        tags: ["color", "design"],
      },
      {
        value: "i-hugeicons:album-01",
        label: "Gallery",
        tags: ["image", "media"],
      },
      {
        value: "i-hugeicons:video-01",
        label: "Video",
        tags: ["media"],
      },
      { value: "i-hugeicons:file-01", label: "File", tags: ["document"] },
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    icons: [
      {
        value: "i-hugeicons:more-horizontal-square-01",
        label: "Menu",
        tags: ["navigation"],
      },
      {
        value: "i-hugeicons:arrow-left-01",
        label: "Arrow Left",
        tags: ["back"],
      },
      { value: "i-hugeicons:menu-02", label: "List", tags: ["items"] },
      {
        value: "i-hugeicons:sidebar-left",
        label: "Sidebar Left",
        tags: ["layout"],
      },
      {
        value: "i-hugeicons:source-code-square",
        label: "Sidebar Right",
        tags: ["layout"],
      },
      {
        value: "i-hugeicons:layer",
        label: "Layers",
        tags: ["stack"],
      },
      {
        value: "i-hugeicons:group-layers",
        label: "Layers Minimal",
        tags: ["stack"],
      },
      {
        value: "i-hugeicons:eye",
        label: "Eye",
        tags: ["show", "preview"],
      },
      {
        value: "i-hugeicons:view-off",
        label: "Eye Closed",
        tags: ["hide"],
      },
      {
        value: "i-hugeicons:lock-password",
        label: "Lock",
        tags: ["secure"],
      },
      {
        value: "i-hugeicons:lock-password",
        label: "Lock Bold",
        tags: ["secure"],
      },
    ],
  },
  {
    id: "devices",
    label: "Devices",
    icons: [
      {
        value: "i-hugeicons:computer",
        label: "Desktop",
        tags: ["screen"],
      },
      {
        value: "i-hugeicons:tablet-01",
        label: "Tablet",
        tags: ["screen"],
      },
      {
        value: "i-hugeicons:smart-phone-01",
        label: "Mobile",
        tags: ["phone", "screen"],
      },
    ],
  },
];

export const ICON_PICKER_SAFE_CLASSES: string[] = ICON_PICKER_GROUPS.flatMap(
  (group) => group.icons.map((icon) => icon.value),
);
