/**
 * Theme-aware status color tokens for light/dark parity.
 *
 * Light mode uses -600 text on tinted surfaces; dark mode uses -400/-100.
 */

export const STATUS_TEXT = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
  violet: "text-violet-600 dark:text-violet-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  rose: "text-rose-600 dark:text-rose-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  orange: "text-orange-600 dark:text-orange-400",
  lime: "text-lime-600 dark:text-lime-400",
} as const;

export const STATUS_SURFACE = {
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
} as const;

export type StatusTone = keyof typeof STATUS_TEXT;
