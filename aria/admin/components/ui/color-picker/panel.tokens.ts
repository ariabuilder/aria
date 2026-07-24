/** Outer popover frame — sidebar padding inset like Cloudflare control wells. */
export const COLOR_PICKER_SHELL_CLASS =
  "bg-muted border-0.5 border-solid border-border/50 rounded-md overflow-hidden p-0 min-w-0 w-full max-w-full";

/** Inner picker surface — solid border sits inside the shell padding. */
export const COLOR_PICKER_PANEL_CLASS =
  "bg-sidebar border border-solid border-border rounded-sm! overflow-hidden min-w-0 w-full max-w-full";

export const SECTION_DIVIDER_CLASS = "border-t border-dashed border-border/50";

/** Scroll regions inside the panel — clip horizontal bleed from nested widgets. */
export const SECTION_SCROLL_CLASS = "overflow-x-hidden overflow-y-auto";

export const SECTION_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";

export const TOOL_ICON_BTN_CLASS =
  "inline-flex size-6! shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-80 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50";

/** Inspector property row trigger (closed state). */
export const COLOR_FIELD_TRIGGER_CLASS =
  "flex items-center gap-2 rounded-sm border border-border/50 border-solid bg-sidebar/40 px-2 h-9! w-full cursor-pointer shadow-none transition-[color,box-shadow] hover:bg-sidebar/80 hover:border-border/50 hover:border-solid focus-visible:border-border focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:shadow-none focus-active:border-primary/80 focus-active:bg-sidebar data-[state=open]:border-border data-[state=open]:bg-sidebar/80 data-[state=open]:ring-border/50 data-[state=open]:ring-[1px]";
