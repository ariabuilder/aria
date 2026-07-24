export const NON_CONFLICTING_SEMANTIC_UNO_COLORS: Record<string, string> = {
  background: "hsl(var(--background) / <alpha-value>)",
  foreground: "hsl(var(--foreground) / <alpha-value>)",
  card: "hsl(var(--card) / <alpha-value>)",
  "card-foreground": "hsl(var(--card-foreground) / <alpha-value>)",
  popover: "hsl(var(--popover) / <alpha-value>)",
  "popover-foreground": "hsl(var(--popover-foreground) / <alpha-value>)",
  "primary-foreground": "hsl(var(--primary-foreground) / <alpha-value>)",
  "secondary-foreground": "hsl(var(--secondary-foreground) / <alpha-value>)",
  muted: "hsl(var(--muted) / <alpha-value>)",
  "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
  "accent-foreground": "hsl(var(--accent-foreground) / <alpha-value>)",
  destructive: "hsl(var(--destructive) / <alpha-value>)",
  "destructive-foreground":
    "hsl(var(--destructive-foreground) / <alpha-value>)",
  border: "hsl(var(--border) / <alpha-value>)",
  input: "hsl(var(--input) / <alpha-value>)",
  ring: "hsl(var(--ring) / <alpha-value>)",
};

export const SYSTEM_BUTTON_SHORTCUTS: Record<string, string> = {
  btn: "inline-flex items-center justify-center px-4 py-2 font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  "btn-primary": "btn bg-primary text-primary-foreground hover:bg-primary/90",
  "btn-secondary":
    "btn bg-secondary text-secondary-foreground hover:bg-secondary/80",
  "btn-muted": "btn bg-muted text-muted-foreground hover:bg-muted/80",
  "btn-destructive":
    "btn bg-destructive text-destructive-foreground hover:bg-destructive/90",
};
