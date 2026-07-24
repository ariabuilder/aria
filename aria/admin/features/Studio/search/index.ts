export { useSearchDialog } from "./composables/useSearchDialog";
export { useStudioCommandPalette } from "./composables/useStudioCommandPalette";
export { default as StudioCommandPalette } from "./components/StudioCommandPalette.vue";
export {
  CommandPalettePageItemSchema,
  CommandPaletteLayoutItemSchema,
  CommandPaletteComponentItemSchema,
  mapPagesToPaletteItems,
  mapLayoutsToPaletteItems,
  mapComponentsToPaletteItems,
  type CommandPalettePageItem,
  type CommandPaletteLayoutItem,
  type CommandPaletteComponentItem,
  type CommandPaletteItem,
} from "./schemas/commandPalette";
