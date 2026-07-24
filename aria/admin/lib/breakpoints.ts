export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const

export type Breakpoint = keyof typeof breakpoints

export const breakpointLabels: Record<Breakpoint, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "X-Large",
  "2xl": "2X-Large",
}

export function isMobile(width: number): boolean {
  return width < breakpoints.md
}

export function isTablet(width: number): boolean {
  return width >= breakpoints.md && width < breakpoints.lg
}

export function isDesktop(width: number): boolean {
  return width >= breakpoints.lg
}
