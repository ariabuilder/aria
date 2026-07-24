export type BreakpointName = "base" | "sm" | "md" | "lg" | "xl" | "2xl";

export interface BreakpointDefinition {
  name: BreakpointName;
  width: number; // px width for canvas preview
  minWidth?: string; // CSS min-width (e.g., "768px")
  icon: string; // Lucide icon name
  label: string; // Display name in UI
}

export const defaultBreakpoints: BreakpointDefinition[] = [
  {
    name: "base",
    width: 375,
    label: "Mobile",
    icon: "Smartphone",
  },
  {
    name: "sm",
    width: 640,
    minWidth: "640px",
    label: "Tablet",
    icon: "Tablet",
  },
  {
    name: "md",
    width: 768,
    minWidth: "768px",
    label: "Desktop",
    icon: "Monitor",
  },
  {
    name: "lg",
    width: 1024,
    minWidth: "1024px",
    label: "Large",
    icon: "MonitorSpeaker",
  },
  {
    name: "xl",
    width: 1280,
    minWidth: "1280px",
    label: "XL",
    icon: "Tv",
  },
  {
    name: "2xl",
    width: 1536,
    minWidth: "1536px",
    label: "2XL",
    icon: "Tv2",
  },
];
