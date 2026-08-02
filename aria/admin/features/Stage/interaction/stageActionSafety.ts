const DEFAULT_ACTION_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label[for]",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
].join(",");

/**
 * Authored controls retain their native markup and state in the Stage. The
 * editor capture boundary suppresses actions that could navigate, submit,
 * toggle, open a picker, or mutate form state.
 */
export function shouldSuppressStageDefaultAction(target: Element): boolean {
  return target.closest(DEFAULT_ACTION_SELECTOR) !== null;
}

export function isFormLifecycleEvent(event: Event): boolean {
  return event.type === "submit" || event.type === "reset";
}
