/**
 * Browser & Cloudflare-compatible autocomplete using static patterns. Uses
 * fuzzy matching against common utility class patterns.
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import { designTokensState } from "../../Design/composables/useDesignTokens";

export interface AutocompleteSuggestion {
  value: string;
  /** Display label (usually same as value) */
  label: string;
  /** Human-readable description of what the utility does */
  description?: string;
  /** Category for grouping (spacing, color, layout, etc.) */
  category?: string;
  /** Match score for sorting (higher = better match) */
  score?: number;
}

export interface UseAutocompleteReturn {
  /** Current suggestions based on search query */
  suggestions: ComputedRef<AutocompleteSuggestion[]>;
  /** Loading state during search */
  isLoading: Ref<boolean>;
  /** Error message if search fails */
  error: Ref<string | null>;
  search: (query: string) => Promise<void>;
  clear: () => void;
  searchWithBreakpoint: (query: string, breakpoint: string) => Promise<void>;
}

interface UtilityPattern {
  prefix: string;
  values: string[];
  description: string;
  category: string;
}

const SPACING = [
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96",
  "px",
  "auto",
];

/** Common sizing values */
const SIZES = [
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96",
  "auto",
  "px",
  "full",
  "screen",
  "min",
  "max",
  "fit",
];

/** Fractional values */
const FRACTIONS = [
  "1/2",
  "1/3",
  "2/3",
  "1/4",
  "2/4",
  "3/4",
  "1/5",
  "2/5",
  "3/5",
  "4/5",
  "1/6",
  "5/6",
  "1/12",
  "2/12",
  "3/12",
  "4/12",
  "5/12",
  "6/12",
  "7/12",
  "8/12",
  "9/12",
  "10/12",
  "11/12",
];

const FONT_SIZES = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
];

const FONT_WEIGHTS = [
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
];

const COLORS = [
  "inherit",
  "current",
  "transparent",
  "black",
  "white",
  "slate-50",
  "slate-100",
  "slate-200",
  "slate-300",
  "slate-400",
  "slate-500",
  "slate-600",
  "slate-700",
  "slate-800",
  "slate-900",
  "slate-950",
  "gray-50",
  "gray-100",
  "gray-200",
  "gray-300",
  "gray-400",
  "gray-500",
  "gray-600",
  "gray-700",
  "gray-800",
  "gray-900",
  "gray-950",
  "zinc-50",
  "zinc-100",
  "zinc-200",
  "zinc-300",
  "zinc-400",
  "zinc-500",
  "zinc-600",
  "zinc-700",
  "zinc-800",
  "zinc-900",
  "zinc-950",
  "neutral-50",
  "neutral-100",
  "neutral-200",
  "neutral-300",
  "neutral-400",
  "neutral-500",
  "neutral-600",
  "neutral-700",
  "neutral-800",
  "neutral-900",
  "neutral-950",
  "red-50",
  "red-100",
  "red-200",
  "red-300",
  "red-400",
  "red-500",
  "red-600",
  "red-700",
  "red-800",
  "red-900",
  "red-950",
  "orange-50",
  "orange-100",
  "orange-200",
  "orange-300",
  "orange-400",
  "orange-500",
  "orange-600",
  "orange-700",
  "orange-800",
  "orange-900",
  "orange-950",
  "amber-50",
  "amber-100",
  "amber-200",
  "amber-300",
  "amber-400",
  "amber-500",
  "amber-600",
  "amber-700",
  "amber-800",
  "amber-900",
  "amber-950",
  "yellow-50",
  "yellow-100",
  "yellow-200",
  "yellow-300",
  "yellow-400",
  "yellow-500",
  "yellow-600",
  "yellow-700",
  "yellow-800",
  "yellow-900",
  "yellow-950",
  "lime-50",
  "lime-100",
  "lime-200",
  "lime-300",
  "lime-400",
  "lime-500",
  "lime-600",
  "lime-700",
  "lime-800",
  "lime-900",
  "lime-950",
  "green-50",
  "green-100",
  "green-200",
  "green-300",
  "green-400",
  "green-500",
  "green-600",
  "green-700",
  "green-800",
  "green-900",
  "green-950",
  "emerald-50",
  "emerald-100",
  "emerald-200",
  "emerald-300",
  "emerald-400",
  "emerald-500",
  "emerald-600",
  "emerald-700",
  "emerald-800",
  "emerald-900",
  "emerald-950",
  "teal-50",
  "teal-100",
  "teal-200",
  "teal-300",
  "teal-400",
  "teal-500",
  "teal-600",
  "teal-700",
  "teal-800",
  "teal-900",
  "teal-950",
  "cyan-50",
  "cyan-100",
  "cyan-200",
  "cyan-300",
  "cyan-400",
  "cyan-500",
  "cyan-600",
  "cyan-700",
  "cyan-800",
  "cyan-900",
  "cyan-950",
  "sky-50",
  "sky-100",
  "sky-200",
  "sky-300",
  "sky-400",
  "sky-500",
  "sky-600",
  "sky-700",
  "sky-800",
  "sky-900",
  "sky-950",
  "blue-50",
  "blue-100",
  "blue-200",
  "blue-300",
  "blue-400",
  "blue-500",
  "blue-600",
  "blue-700",
  "blue-800",
  "blue-900",
  "blue-950",
  "indigo-50",
  "indigo-100",
  "indigo-200",
  "indigo-300",
  "indigo-400",
  "indigo-500",
  "indigo-600",
  "indigo-700",
  "indigo-800",
  "indigo-900",
  "indigo-950",
  "violet-50",
  "violet-100",
  "violet-200",
  "violet-300",
  "violet-400",
  "violet-500",
  "violet-600",
  "violet-700",
  "violet-800",
  "violet-900",
  "violet-950",
  "purple-50",
  "purple-100",
  "purple-200",
  "purple-300",
  "purple-400",
  "purple-500",
  "purple-600",
  "purple-700",
  "purple-800",
  "purple-900",
  "purple-950",
  "fuchsia-50",
  "fuchsia-100",
  "fuchsia-200",
  "fuchsia-300",
  "fuchsia-400",
  "fuchsia-500",
  "fuchsia-600",
  "fuchsia-700",
  "fuchsia-800",
  "fuchsia-900",
  "fuchsia-950",
  "pink-50",
  "pink-100",
  "pink-200",
  "pink-300",
  "pink-400",
  "pink-500",
  "pink-600",
  "pink-700",
  "pink-800",
  "pink-900",
  "pink-950",
  "rose-50",
  "rose-100",
  "rose-200",
  "rose-300",
  "rose-400",
  "rose-500",
  "rose-600",
  "rose-700",
  "rose-800",
  "rose-900",
  "rose-950",
];

const RADIUS = ["none", "sm", "", "md", "lg", "xl", "2xl", "3xl", "full"];

/** Shadow values */
const SHADOWS = ["sm", "", "md", "lg", "xl", "2xl", "inner", "none"];

/** Opacity values */
const OPACITIES = [
  "0",
  "5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
  "65",
  "70",
  "75",
  "80",
  "85",
  "90",
  "95",
  "100",
];

const Z_INDEX = ["0", "10", "20", "30", "40", "50", "auto"];

/** Grid column counts */
const GRID_COLS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "none",
  "subgrid",
];

/** Grid row counts */
const GRID_ROWS = ["1", "2", "3", "4", "5", "6", "none", "subgrid"];

const PATTERNS: UtilityPattern[] = [
  {
    prefix: "",
    values: [
      "block",
      "inline-block",
      "inline",
      "flex",
      "inline-flex",
      "grid",
      "inline-grid",
      "contents",
      "hidden",
      "flow-root",
      "list-item",
    ],
    description: "Display",
    category: "display",
  },

  {
    prefix: "flex-",
    values: [
      "row",
      "row-reverse",
      "col",
      "col-reverse",
      "wrap",
      "wrap-reverse",
      "nowrap",
      "1",
      "auto",
      "initial",
      "none",
    ],
    description: "Flex",
    category: "layout",
  },
  {
    prefix: "justify-",
    values: [
      "start",
      "end",
      "center",
      "between",
      "around",
      "evenly",
      "stretch",
      "normal",
    ],
    description: "Justify content",
    category: "layout",
  },
  {
    prefix: "items-",
    values: ["start", "end", "center", "baseline", "stretch"],
    description: "Align items",
    category: "layout",
  },
  {
    prefix: "self-",
    values: ["auto", "start", "end", "center", "stretch", "baseline"],
    description: "Align self",
    category: "layout",
  },
  {
    prefix: "content-",
    values: [
      "start",
      "end",
      "center",
      "between",
      "around",
      "evenly",
      "baseline",
      "stretch",
      "normal",
    ],
    description: "Align content",
    category: "layout",
  },
  {
    prefix: "grow",
    values: ["", "-0"],
    description: "Flex grow",
    category: "layout",
  },
  {
    prefix: "shrink",
    values: ["", "-0"],
    description: "Flex shrink",
    category: "layout",
  },
  {
    prefix: "basis-",
    values: [...SPACING, ...FRACTIONS],
    description: "Flex basis",
    category: "layout",
  },
  {
    prefix: "order-",
    values: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "first",
      "last",
      "none",
    ],
    description: "Order",
    category: "layout",
  },

  {
    prefix: "grid-cols-",
    values: GRID_COLS,
    description: "Grid columns",
    category: "layout",
  },
  {
    prefix: "grid-rows-",
    values: GRID_ROWS,
    description: "Grid rows",
    category: "layout",
  },
  {
    prefix: "col-span-",
    values: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "full",
    ],
    description: "Column span",
    category: "layout",
  },
  {
    prefix: "col-start-",
    values: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "auto",
    ],
    description: "Column start",
    category: "layout",
  },
  {
    prefix: "col-end-",
    values: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "auto",
    ],
    description: "Column end",
    category: "layout",
  },
  {
    prefix: "row-span-",
    values: ["1", "2", "3", "4", "5", "6", "full"],
    description: "Row span",
    category: "layout",
  },
  {
    prefix: "row-start-",
    values: ["1", "2", "3", "4", "5", "6", "7", "auto"],
    description: "Row start",
    category: "layout",
  },
  {
    prefix: "row-end-",
    values: ["1", "2", "3", "4", "5", "6", "7", "auto"],
    description: "Row end",
    category: "layout",
  },
  { prefix: "gap-", values: SPACING, description: "Gap", category: "spacing" },
  {
    prefix: "gap-x-",
    values: SPACING,
    description: "Column gap",
    category: "spacing",
  },
  {
    prefix: "gap-y-",
    values: SPACING,
    description: "Row gap",
    category: "spacing",
  },

  {
    prefix: "p-",
    values: SPACING,
    description: "Padding",
    category: "spacing",
  },
  {
    prefix: "px-",
    values: SPACING,
    description: "Padding X",
    category: "spacing",
  },
  {
    prefix: "py-",
    values: SPACING,
    description: "Padding Y",
    category: "spacing",
  },
  {
    prefix: "pt-",
    values: SPACING,
    description: "Padding top",
    category: "spacing",
  },
  {
    prefix: "pr-",
    values: SPACING,
    description: "Padding right",
    category: "spacing",
  },
  {
    prefix: "pb-",
    values: SPACING,
    description: "Padding bottom",
    category: "spacing",
  },
  {
    prefix: "pl-",
    values: SPACING,
    description: "Padding left",
    category: "spacing",
  },

  { prefix: "m-", values: SPACING, description: "Margin", category: "spacing" },
  {
    prefix: "mx-",
    values: SPACING,
    description: "Margin X",
    category: "spacing",
  },
  {
    prefix: "my-",
    values: SPACING,
    description: "Margin Y",
    category: "spacing",
  },
  {
    prefix: "mt-",
    values: SPACING,
    description: "Margin top",
    category: "spacing",
  },
  {
    prefix: "mr-",
    values: SPACING,
    description: "Margin right",
    category: "spacing",
  },
  {
    prefix: "mb-",
    values: SPACING,
    description: "Margin bottom",
    category: "spacing",
  },
  {
    prefix: "ml-",
    values: SPACING,
    description: "Margin left",
    category: "spacing",
  },
  {
    prefix: "-m-",
    values: SPACING,
    description: "Negative margin",
    category: "spacing",
  },
  {
    prefix: "-mx-",
    values: SPACING,
    description: "Negative margin X",
    category: "spacing",
  },
  {
    prefix: "-my-",
    values: SPACING,
    description: "Negative margin Y",
    category: "spacing",
  },
  {
    prefix: "-mt-",
    values: SPACING,
    description: "Negative margin top",
    category: "spacing",
  },
  {
    prefix: "-mr-",
    values: SPACING,
    description: "Negative margin right",
    category: "spacing",
  },
  {
    prefix: "-mb-",
    values: SPACING,
    description: "Negative margin bottom",
    category: "spacing",
  },
  {
    prefix: "-ml-",
    values: SPACING,
    description: "Negative margin left",
    category: "spacing",
  },
  {
    prefix: "space-x-",
    values: SPACING,
    description: "Horizontal space between",
    category: "spacing",
  },
  {
    prefix: "space-y-",
    values: SPACING,
    description: "Vertical space between",
    category: "spacing",
  },

  {
    prefix: "w-",
    values: [...SIZES, ...FRACTIONS],
    description: "Width",
    category: "sizing",
  },
  {
    prefix: "h-",
    values: [...SIZES, ...FRACTIONS],
    description: "Height",
    category: "sizing",
  },
  {
    prefix: "size-",
    values: SIZES,
    description: "Width & Height",
    category: "sizing",
  },
  {
    prefix: "min-w-",
    values: ["0", "full", "min", "max", "fit"],
    description: "Min width",
    category: "sizing",
  },
  {
    prefix: "max-w-",
    values: [
      "0",
      "none",
      "xs",
      "sm",
      "md",
      "lg",
      "xl",
      "2xl",
      "3xl",
      "4xl",
      "5xl",
      "6xl",
      "7xl",
      "full",
      "min",
      "max",
      "fit",
      "prose",
      "screen-sm",
      "screen-md",
      "screen-lg",
      "screen-xl",
      "screen-2xl",
    ],
    description: "Max width",
    category: "sizing",
  },
  {
    prefix: "min-h-",
    values: ["0", "full", "screen", "min", "max", "fit"],
    description: "Min height",
    category: "sizing",
  },
  {
    prefix: "max-h-",
    values: [...SIZES, "none", "full", "screen", "min", "max", "fit"],
    description: "Max height",
    category: "sizing",
  },

  {
    prefix: "text-",
    values: [
      ...FONT_SIZES,
      ...COLORS,
      "left",
      "center",
      "right",
      "justify",
      "start",
      "end",
      "wrap",
      "nowrap",
      "balance",
      "pretty",
    ],
    description: "Text",
    category: "typography",
  },
  {
    prefix: "font-",
    values: [...FONT_WEIGHTS, "sans", "serif", "mono"],
    description: "Font",
    category: "typography",
  },
  {
    prefix: "leading-",
    values: [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "none",
      "tight",
      "snug",
      "normal",
      "relaxed",
      "loose",
    ],
    description: "Line height",
    category: "typography",
  },
  {
    prefix: "tracking-",
    values: ["tighter", "tight", "normal", "wide", "wider", "widest"],
    description: "Letter spacing",
    category: "typography",
  },
  {
    prefix: "",
    values: ["uppercase", "lowercase", "capitalize", "normal-case"],
    description: "Text transform",
    category: "typography",
  },
  {
    prefix: "",
    values: ["underline", "overline", "line-through", "no-underline"],
    description: "Text decoration",
    category: "typography",
  },
  {
    prefix: "",
    values: ["truncate", "text-ellipsis", "text-clip"],
    description: "Text overflow",
    category: "typography",
  },
  {
    prefix: "",
    values: ["italic", "not-italic"],
    description: "Font style",
    category: "typography",
  },
  {
    prefix: "whitespace-",
    values: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"],
    description: "Whitespace",
    category: "typography",
  },
  {
    prefix: "break-",
    values: ["normal", "words", "all", "keep"],
    description: "Word break",
    category: "typography",
  },
  {
    prefix: "align-",
    values: [
      "baseline",
      "top",
      "middle",
      "bottom",
      "text-top",
      "text-bottom",
      "sub",
      "super",
    ],
    description: "Vertical align",
    category: "typography",
  },

  {
    prefix: "bg-",
    values: [
      ...COLORS,
      "none",
      "gradient-to-t",
      "gradient-to-tr",
      "gradient-to-r",
      "gradient-to-br",
      "gradient-to-b",
      "gradient-to-bl",
      "gradient-to-l",
      "gradient-to-tl",
      "fixed",
      "local",
      "scroll",
      "auto",
      "cover",
      "contain",
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "repeat",
      "no-repeat",
      "repeat-x",
      "repeat-y",
      "repeat-round",
      "repeat-space",
    ],
    description: "Background",
    category: "background",
  },
  {
    prefix: "from-",
    values: COLORS,
    description: "Gradient from",
    category: "background",
  },
  {
    prefix: "via-",
    values: COLORS,
    description: "Gradient via",
    category: "background",
  },
  {
    prefix: "to-",
    values: COLORS,
    description: "Gradient to",
    category: "background",
  },

  {
    prefix: "border",
    values: [
      "",
      "-0",
      "-2",
      "-4",
      "-8",
      "-x",
      "-x-0",
      "-x-2",
      "-x-4",
      "-x-8",
      "-y",
      "-y-0",
      "-y-2",
      "-y-4",
      "-y-8",
      "-t",
      "-t-0",
      "-t-2",
      "-t-4",
      "-t-8",
      "-r",
      "-r-0",
      "-r-2",
      "-r-4",
      "-r-8",
      "-b",
      "-b-0",
      "-b-2",
      "-b-4",
      "-b-8",
      "-l",
      "-l-0",
      "-l-2",
      "-l-4",
      "-l-8",
      "-solid",
      "-dashed",
      "-dotted",
      "-double",
      "-hidden",
      "-none",
    ],
    description: "Border",
    category: "border",
  },
  {
    prefix: "border-",
    values: COLORS,
    description: "Border color",
    category: "border",
  },
  {
    prefix: "rounded",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius",
    category: "border",
  },
  {
    prefix: "rounded-t",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius top",
    category: "border",
  },
  {
    prefix: "rounded-r",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius right",
    category: "border",
  },
  {
    prefix: "rounded-b",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius bottom",
    category: "border",
  },
  {
    prefix: "rounded-l",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius left",
    category: "border",
  },
  {
    prefix: "rounded-tl",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius top-left",
    category: "border",
  },
  {
    prefix: "rounded-tr",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius top-right",
    category: "border",
  },
  {
    prefix: "rounded-bl",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius bottom-left",
    category: "border",
  },
  {
    prefix: "rounded-br",
    values: RADIUS.map((r) => (r ? `-${r}` : "")),
    description: "Border radius bottom-right",
    category: "border",
  },
  {
    prefix: "divide-",
    values: [
      "x",
      "x-0",
      "x-2",
      "x-4",
      "x-8",
      "y",
      "y-0",
      "y-2",
      "y-4",
      "y-8",
      "x-reverse",
      "y-reverse",
      "solid",
      "dashed",
      "dotted",
      "double",
      "none",
      ...COLORS,
    ],
    description: "Divide",
    category: "border",
  },
  {
    prefix: "ring",
    values: ["", "-0", "-1", "-2", "-4", "-8", "-inset"],
    description: "Ring",
    category: "border",
  },
  {
    prefix: "ring-",
    values: [
      ...COLORS,
      "offset-0",
      "offset-1",
      "offset-2",
      "offset-4",
      "offset-8",
    ],
    description: "Ring color/offset",
    category: "border",
  },
  {
    prefix: "outline",
    values: [
      "",
      "-none",
      "-dashed",
      "-dotted",
      "-double",
      "-0",
      "-1",
      "-2",
      "-4",
      "-8",
    ],
    description: "Outline",
    category: "border",
  },
  {
    prefix: "outline-",
    values: [
      ...COLORS,
      "offset-0",
      "offset-1",
      "offset-2",
      "offset-4",
      "offset-8",
    ],
    description: "Outline color/offset",
    category: "border",
  },

  {
    prefix: "shadow",
    values: SHADOWS.map((s) => (s ? `-${s}` : "")),
    description: "Box shadow",
    category: "effects",
  },
  {
    prefix: "shadow-",
    values: COLORS,
    description: "Shadow color",
    category: "effects",
  },
  {
    prefix: "opacity-",
    values: OPACITIES,
    description: "Opacity",
    category: "effects",
  },
  {
    prefix: "blur",
    values: ["", "-none", "-sm", "-md", "-lg", "-xl", "-2xl", "-3xl"],
    description: "Blur",
    category: "effects",
  },
  {
    prefix: "brightness-",
    values: [
      "0",
      "50",
      "75",
      "90",
      "95",
      "100",
      "105",
      "110",
      "125",
      "150",
      "200",
    ],
    description: "Brightness",
    category: "effects",
  },
  {
    prefix: "contrast-",
    values: ["0", "50", "75", "100", "125", "150", "200"],
    description: "Contrast",
    category: "effects",
  },
  {
    prefix: "grayscale",
    values: ["", "-0"],
    description: "Grayscale",
    category: "effects",
  },
  {
    prefix: "invert",
    values: ["", "-0"],
    description: "Invert",
    category: "effects",
  },
  {
    prefix: "saturate-",
    values: ["0", "50", "100", "150", "200"],
    description: "Saturate",
    category: "effects",
  },
  {
    prefix: "sepia",
    values: ["", "-0"],
    description: "Sepia",
    category: "effects",
  },
  {
    prefix: "hue-rotate-",
    values: ["0", "15", "30", "60", "90", "180"],
    description: "Hue rotate",
    category: "effects",
  },
  {
    prefix: "drop-shadow",
    values: ["", "-sm", "-md", "-lg", "-xl", "-2xl", "-none"],
    description: "Drop shadow",
    category: "effects",
  },
  {
    prefix: "backdrop-blur",
    values: ["", "-none", "-sm", "-md", "-lg", "-xl", "-2xl", "-3xl"],
    description: "Backdrop blur",
    category: "effects",
  },
  {
    prefix: "backdrop-brightness-",
    values: [
      "0",
      "50",
      "75",
      "90",
      "95",
      "100",
      "105",
      "110",
      "125",
      "150",
      "200",
    ],
    description: "Backdrop brightness",
    category: "effects",
  },
  {
    prefix: "mix-blend-",
    values: [
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
      "plus-lighter",
    ],
    description: "Mix blend mode",
    category: "effects",
  },

  {
    prefix: "",
    values: ["static", "fixed", "absolute", "relative", "sticky"],
    description: "Position",
    category: "position",
  },
  {
    prefix: "top-",
    values: [...SPACING, ...FRACTIONS],
    description: "Top",
    category: "position",
  },
  {
    prefix: "right-",
    values: [...SPACING, ...FRACTIONS],
    description: "Right",
    category: "position",
  },
  {
    prefix: "bottom-",
    values: [...SPACING, ...FRACTIONS],
    description: "Bottom",
    category: "position",
  },
  {
    prefix: "left-",
    values: [...SPACING, ...FRACTIONS],
    description: "Left",
    category: "position",
  },
  {
    prefix: "inset-",
    values: [...SPACING, ...FRACTIONS, "auto"],
    description: "Inset",
    category: "position",
  },
  {
    prefix: "inset-x-",
    values: [...SPACING, ...FRACTIONS, "auto"],
    description: "Inset X",
    category: "position",
  },
  {
    prefix: "inset-y-",
    values: [...SPACING, ...FRACTIONS, "auto"],
    description: "Inset Y",
    category: "position",
  },
  {
    prefix: "-top-",
    values: SPACING,
    description: "Negative top",
    category: "position",
  },
  {
    prefix: "-right-",
    values: SPACING,
    description: "Negative right",
    category: "position",
  },
  {
    prefix: "-bottom-",
    values: SPACING,
    description: "Negative bottom",
    category: "position",
  },
  {
    prefix: "-left-",
    values: SPACING,
    description: "Negative left",
    category: "position",
  },
  {
    prefix: "z-",
    values: Z_INDEX,
    description: "Z-index",
    category: "position",
  },
  {
    prefix: "",
    values: ["visible", "invisible", "collapse"],
    description: "Visibility",
    category: "position",
  },

  {
    prefix: "overflow-",
    values: [
      "auto",
      "hidden",
      "clip",
      "visible",
      "scroll",
      "x-auto",
      "y-auto",
      "x-hidden",
      "y-hidden",
      "x-clip",
      "y-clip",
      "x-visible",
      "y-visible",
      "x-scroll",
      "y-scroll",
    ],
    description: "Overflow",
    category: "overflow",
  },
  {
    prefix: "overscroll-",
    values: [
      "auto",
      "contain",
      "none",
      "y-auto",
      "y-contain",
      "y-none",
      "x-auto",
      "x-contain",
      "x-none",
    ],
    description: "Overscroll",
    category: "overflow",
  },

  {
    prefix: "scale-",
    values: [
      "0",
      "50",
      "75",
      "90",
      "95",
      "100",
      "105",
      "110",
      "125",
      "150",
      "x-0",
      "x-50",
      "x-75",
      "x-90",
      "x-95",
      "x-100",
      "x-105",
      "x-110",
      "x-125",
      "x-150",
      "y-0",
      "y-50",
      "y-75",
      "y-90",
      "y-95",
      "y-100",
      "y-105",
      "y-110",
      "y-125",
      "y-150",
    ],
    description: "Scale",
    category: "transform",
  },
  {
    prefix: "rotate-",
    values: ["0", "1", "2", "3", "6", "12", "45", "90", "180"],
    description: "Rotate",
    category: "transform",
  },
  {
    prefix: "-rotate-",
    values: ["1", "2", "3", "6", "12", "45", "90", "180"],
    description: "Negative rotate",
    category: "transform",
  },
  {
    prefix: "translate-x-",
    values: [...SPACING, ...FRACTIONS, "full"],
    description: "Translate X",
    category: "transform",
  },
  {
    prefix: "translate-y-",
    values: [...SPACING, ...FRACTIONS, "full"],
    description: "Translate Y",
    category: "transform",
  },
  {
    prefix: "-translate-x-",
    values: [...SPACING, ...FRACTIONS, "full"],
    description: "Negative translate X",
    category: "transform",
  },
  {
    prefix: "-translate-y-",
    values: [...SPACING, ...FRACTIONS, "full"],
    description: "Negative translate Y",
    category: "transform",
  },
  {
    prefix: "skew-x-",
    values: ["0", "1", "2", "3", "6", "12"],
    description: "Skew X",
    category: "transform",
  },
  {
    prefix: "skew-y-",
    values: ["0", "1", "2", "3", "6", "12"],
    description: "Skew Y",
    category: "transform",
  },
  {
    prefix: "-skew-x-",
    values: ["1", "2", "3", "6", "12"],
    description: "Negative skew X",
    category: "transform",
  },
  {
    prefix: "-skew-y-",
    values: ["1", "2", "3", "6", "12"],
    description: "Negative skew Y",
    category: "transform",
  },
  {
    prefix: "origin-",
    values: [
      "center",
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
      "top-left",
    ],
    description: "Transform origin",
    category: "transform",
  },

  // Transitions & Animation
  {
    prefix: "transition",
    values: [
      "",
      "-none",
      "-all",
      "-colors",
      "-opacity",
      "-shadow",
      "-transform",
    ],
    description: "Transition",
    category: "animation",
  },
  {
    prefix: "duration-",
    values: ["0", "75", "100", "150", "200", "300", "500", "700", "1000"],
    description: "Duration",
    category: "animation",
  },
  {
    prefix: "ease-",
    values: ["linear", "in", "out", "in-out"],
    description: "Timing function",
    category: "animation",
  },
  {
    prefix: "delay-",
    values: ["0", "75", "100", "150", "200", "300", "500", "700", "1000"],
    description: "Delay",
    category: "animation",
  },
  {
    prefix: "animate-",
    values: ["none", "spin", "ping", "pulse", "bounce"],
    description: "Animation",
    category: "animation",
  },

  {
    prefix: "cursor-",
    values: [
      "auto",
      "default",
      "pointer",
      "wait",
      "text",
      "move",
      "help",
      "not-allowed",
      "none",
      "context-menu",
      "progress",
      "cell",
      "crosshair",
      "vertical-text",
      "alias",
      "copy",
      "no-drop",
      "grab",
      "grabbing",
      "all-scroll",
      "col-resize",
      "row-resize",
      "n-resize",
      "e-resize",
      "s-resize",
      "w-resize",
      "ne-resize",
      "nw-resize",
      "se-resize",
      "sw-resize",
      "ew-resize",
      "ns-resize",
      "nesw-resize",
      "nwse-resize",
      "zoom-in",
      "zoom-out",
    ],
    description: "Cursor",
    category: "interactivity",
  },
  {
    prefix: "pointer-events-",
    values: ["none", "auto"],
    description: "Pointer events",
    category: "interactivity",
  },
  {
    prefix: "select-",
    values: ["none", "text", "all", "auto"],
    description: "User select",
    category: "interactivity",
  },
  {
    prefix: "resize",
    values: ["", "-none", "-y", "-x"],
    description: "Resize",
    category: "interactivity",
  },
  {
    prefix: "scroll-",
    values: [
      "auto",
      "smooth",
      "m-0",
      "m-1",
      "m-2",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
      "m-8",
      "mt-0",
      "mt-1",
      "mt-2",
      "mt-3",
      "mt-4",
      "mt-5",
      "mt-6",
      "mt-8",
      "p-0",
      "p-1",
      "p-2",
      "p-3",
      "p-4",
      "p-5",
      "p-6",
      "p-8",
      "pt-0",
      "pt-1",
      "pt-2",
      "pt-3",
      "pt-4",
      "pt-5",
      "pt-6",
      "pt-8",
    ],
    description: "Scroll",
    category: "interactivity",
  },
  {
    prefix: "snap-",
    values: [
      "start",
      "end",
      "center",
      "align-none",
      "normal",
      "always",
      "x",
      "y",
      "both",
      "mandatory",
      "proximity",
      "none",
    ],
    description: "Scroll snap",
    category: "interactivity",
  },
  {
    prefix: "touch-",
    values: [
      "auto",
      "none",
      "pan-x",
      "pan-left",
      "pan-right",
      "pan-y",
      "pan-up",
      "pan-down",
      "pinch-zoom",
      "manipulation",
    ],
    description: "Touch action",
    category: "interactivity",
  },
  {
    prefix: "appearance-",
    values: ["none", "auto"],
    description: "Appearance",
    category: "interactivity",
  },
  {
    prefix: "accent-",
    values: [...COLORS, "auto"],
    description: "Accent color",
    category: "interactivity",
  },
  {
    prefix: "caret-",
    values: COLORS,
    description: "Caret color",
    category: "interactivity",
  },
  {
    prefix: "will-change-",
    values: ["auto", "scroll", "contents", "transform"],
    description: "Will change",
    category: "interactivity",
  },

  {
    prefix: "fill-",
    values: [...COLORS, "none"],
    description: "SVG fill",
    category: "svg",
  },
  {
    prefix: "stroke-",
    values: [...COLORS, "none", "0", "1", "2"],
    description: "SVG stroke",
    category: "svg",
  },

  {
    prefix: "aspect-",
    values: ["auto", "square", "video"],
    description: "Aspect ratio",
    category: "sizing",
  },

  {
    prefix: "object-",
    values: [
      "contain",
      "cover",
      "fill",
      "none",
      "scale-down",
      "bottom",
      "center",
      "left",
      "left-bottom",
      "left-top",
      "right",
      "right-bottom",
      "right-top",
      "top",
    ],
    description: "Object fit/position",
    category: "sizing",
  },

  {
    prefix: "",
    values: ["container"],
    description: "Container",
    category: "layout",
  },

  {
    prefix: "",
    values: ["sr-only", "not-sr-only"],
    description: "Screen reader",
    category: "accessibility",
  },
];

// BUILD CLASS LIST (cached)

interface ClassEntry {
  value: string;
  description: string;
  category: string;
}

let cachedClasses: ClassEntry[] | null = null;
let cachedDynamicColorSignature: string | null = null;

const DYNAMIC_COLOR_PREFIXES = [
  "bg-",
  "text-",
  "border-",
  "from-",
  "via-",
  "to-",
  "ring-",
  "ring-offset-",
  "outline-",
  "decoration-",
  "fill-",
  "stroke-",
  "caret-",
  "accent-",
  "placeholder-",
  "shadow-",
];

function buildDynamicColorTokens(): string[] {
  const tokens = new Set<string>();

  for (const key of Object.keys(designTokensState.semanticColors)) {
    tokens.add(key);
  }

  for (const [name, value] of Object.entries(
    designTokensState.colors as Record<string, unknown>,
  )) {
    if (typeof value === "string") {
      tokens.add(name);
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const shades = value as Record<string, string>;
    if (shades.DEFAULT || shades["500"]) {
      tokens.add(name);
    }

    for (const shade of Object.keys(shades)) {
      if (shade === "DEFAULT") continue;
      tokens.add(`${name}-${shade}`);
    }
  }

  return Array.from(tokens).sort();
}

function buildClassList(): ClassEntry[] {
  const dynamicColorTokens = buildDynamicColorTokens();
  const dynamicColorSignature = dynamicColorTokens.join("|");

  if (cachedClasses && cachedDynamicColorSignature === dynamicColorSignature) {
    return cachedClasses;
  }

  const classes: ClassEntry[] = [];
  const seen = new Set<string>();

  const pushClass = (entry: ClassEntry) => {
    if (seen.has(entry.value)) return;
    seen.add(entry.value);
    classes.push(entry);
  };

  for (const pattern of PATTERNS) {
    for (const value of pattern.values) {
      const className = pattern.prefix + value;
      if (className) {
        pushClass({
          value: className,
          description: pattern.description,
          category: pattern.category,
        });
      }
    }
  }

  for (const prefix of DYNAMIC_COLOR_PREFIXES) {
    for (const colorToken of dynamicColorTokens) {
      pushClass({
        value: `${prefix}${colorToken}`,
        description: "Theme color",
        category: "color",
      });
    }
  }

  cachedClasses = classes;
  cachedDynamicColorSignature = dynamicColorSignature;
  return classes;
}

/**
 * Simple fuzzy match scoring.
 * Returns score (higher = better match) or 0 if no match.
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t === q) return 1000;

  // Starts with query
  if (t.startsWith(q)) return 500 + (q.length / t.length) * 100;

  if (t.includes(q)) return 200 + (q.length / t.length) * 50;

  let score = 0;
  let qi = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      if (lastMatchIdx === ti - 1) {
        score += 15;
      } else {
        score += 10;
      }
      // Bonus for matching at word boundaries
      if (ti === 0 || t[ti - 1] === "-" || t[ti - 1] === "_") {
        score += 5;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  // Only count as match if all query chars found
  if (qi === q.length) {
    return score;
  }

  return 0;
}

const suggestions = ref<AutocompleteSuggestion[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

export function useAutocomplete(): UseAutocompleteReturn {
  /**
   * Search for utility class suggestions.
   */
  async function search(query: string): Promise<void> {
    if (!query || query.length < 1) {
      suggestions.value = [];
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const classes = buildClassList();
      const results: AutocompleteSuggestion[] = [];

      for (const cls of classes) {
        const score = fuzzyScore(query, cls.value);
        if (score > 0) {
          results.push({
            value: cls.value,
            label: cls.value,
            description: cls.description,
            category: cls.category,
            score,
          });
        }
      }

      // Sort by score (descending) and limit
      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      suggestions.value = results.slice(0, 15);
    } catch (e) {
      console.error("[useAutocomplete] Search failed:", e);
      error.value = e instanceof Error ? e.message : "Search failed";
      suggestions.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Search with breakpoint prefix.
   */
  async function searchWithBreakpoint(
    query: string,
    breakpoint: string,
  ): Promise<void> {
    if (breakpoint === "base") {
      await search(query);
      return;
    }

    if (!query || query.length < 1) {
      suggestions.value = [];
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const classes = buildClassList();
      const results: AutocompleteSuggestion[] = [];

      for (const cls of classes) {
        const score = fuzzyScore(query, cls.value);
        if (score > 0) {
          results.push({
            value: `${breakpoint}:${cls.value}`,
            label: `${breakpoint}:${cls.value}`,
            description: cls.description,
            category: cls.category,
            score,
          });
        }
      }

      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      suggestions.value = results.slice(0, 15);
    } catch (e) {
      console.error("[useAutocomplete] Search failed:", e);
      error.value = e instanceof Error ? e.message : "Search failed";
      suggestions.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Clear all suggestions.
   */
  function clear(): void {
    suggestions.value = [];
    error.value = null;
  }

  return {
    suggestions: computed(() => suggestions.value),
    isLoading,
    error,
    search,
    clear,
    searchWithBreakpoint,
  };
}
