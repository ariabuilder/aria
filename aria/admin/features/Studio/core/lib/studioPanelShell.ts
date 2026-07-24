/** Stable Studio chrome on StudioApp `<main>` — survives route changes. */
export const STUDIO_MAIN_CLASS =
  "relative isolate flex min-h-0 flex-1 flex-col overflow-clip rounded-md border border-solid border-border bg-background";

/** Neutral outer container for split-panel views where each panel owns chrome. */
export const STUDIO_SPLIT_MAIN_CLASS =
  "relative isolate flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar";

/** Rail + content row (organizer sits in the gutter, inside main). */
export const STUDIO_RAIL_LAYOUT_CLASS =
  "flex h-full min-h-0 gap-1.5 overflow-hidden bg-sidebar";

/** Rail view content panel — owns its own chrome beside the organizer rail. */
export const STUDIO_VIEW_CONTENT_CLASS =
  "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-solid border-border bg-background";

/** Single-column view panel. */
export const STUDIO_VIEW_ROOT_CLASS =
  "relative flex h-full min-h-0 flex-col overflow-hidden";
