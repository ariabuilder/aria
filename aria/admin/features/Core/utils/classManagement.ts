/**
 * Prefixes and conflict resolution for responsive design.
 */

/**
 * Parse className string into map of breakpoint → classes
 *
 * @example
 * parseClassesByBreakpoint('p-4 md:p-8 lg:p-12 hover:bg-blue-500')
 * // Returns Map {
 * //   'base' => ['p-4', 'hover:bg-blue-500'],
 * //   'md' => ['p-8'],
 * //   'lg' => ['p-12']
 * // }
 */
export function parseClassesByBreakpoint(
  className: string
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const classes = className.split(" ").filter(Boolean);

  classes.forEach((cls) => {
    if (cls.includes(":")) {
      const [breakpoint, ...rest] = cls.split(":");
      const actualClass = rest.join(":");
      const existing = result.get(breakpoint) || [];
      result.set(breakpoint, [...existing, actualClass]);
    } else {
      const existing = result.get("base") || [];
      result.set("base", [...existing, cls]);
    }
  });

  return result;
}

/**
 * Remove classes matching a pattern (e.g., "text-*")
 *
 * @example
 * removeClassPattern('text-sm text-blue-600 p-4', /\btext-(xs|sm|base|lg|xl)\b/)
 * // Returns 'text-blue-600 p-4'
 */
export function removeClassPattern(className: string, pattern: RegExp): string {
  return className
    .split(" ")
    .filter((cls) => !pattern.test(cls))
    .join(" ");
}

/**
 * Add class with breakpoint prefix, removing conflicts
 *
 * @param className - Current className string
 * @param newClass - Class to add (without breakpoint prefix)
 * @param breakpoint - Current breakpoint ('base', 'sm', 'md', etc.)
 * @param conflictPattern - Optional regex to remove conflicting classes
 *
 * @example
 * // Add responsive class
 * addClassWithBreakpoint('p-4', 'text-lg', 'md')
 * // Returns 'p-4 md:text-lg'
 *
 * @example
 * // With conflict resolution
 * addClassWithBreakpoint('text-sm', 'text-lg', 'base', /\btext-(xs|sm|base|lg|xl)\b/)
 * // Returns 'text-lg' (removed text-sm)
 */
export function addClassWithBreakpoint(
  className: string,
  newClass: string,
  breakpoint: string,
  conflictPattern?: RegExp
): string {
  let result = className.trim();

  // Remove conflicting classes if pattern provided
  if (conflictPattern) {
    result = removeClassPattern(result, conflictPattern);
  }

  // Add new class with prefix
  const prefix = breakpoint === "base" ? "" : `${breakpoint}:`;
  const classToAdd = `${prefix}${newClass}`;

  return `${result} ${classToAdd}`.trim();
}

/**
 * Get classes for specific breakpoint
 *
 * @example
 * getClassesForBreakpoint('p-4 md:p-8 lg:p-12', 'md')
 * // Returns ['p-8']
 */
export function getClassesForBreakpoint(
  className: string,
  breakpoint: string
): string[] {
  const map = parseClassesByBreakpoint(className);
  return map.get(breakpoint) || [];
}

/**
 * Remove a specific class (with or without breakpoint prefix)
 *
 * @example
 * removeClass('p-4 md:text-lg hover:scale-105', 'md:text-lg')
 * // Returns 'p-4 hover:scale-105'
 */
export function removeClass(className: string, classToRemove: string): string {
  return className
    .split(" ")
    .filter((cls) => cls !== classToRemove)
    .join(" ")
    .trim();
}

/**
 * Check if className contains a specific class
 *
 * @example
 * hasClass('p-4 md:text-lg', 'md:text-lg') // true
 * hasClass('p-4 md:text-lg', 'text-lg') // false
 */
export function hasClass(className: string, targetClass: string): boolean {
  return className.split(" ").includes(targetClass);
}

/**
 * Get all unique breakpoints used in className
 *
 * @example
 * getUsedBreakpoints('p-4 md:p-8 lg:p-12 md:text-lg')
 * // Returns ['base', 'md', 'lg']
 */
export function getUsedBreakpoints(className: string): string[] {
  const breakpoints = new Set<string>();
  const classes = className.split(" ").filter(Boolean);

  classes.forEach((cls) => {
    if (cls.includes(":")) {
      const breakpoint = cls.split(":")[0];
      breakpoints.add(breakpoint);
    } else {
      breakpoints.add("base");
    }
  });

  return Array.from(breakpoints);
}

export const CONFLICT_PATTERNS = {
  fontSize: /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/,
  fontWeight:
    /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/,
  textColor:
    /\btext-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/,
  backgroundColor:
    /\bbg-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/,
  padding: /\bp-\d+/,
  paddingX: /\bpx-\d+/,
  paddingY: /\bpy-\d+/,
  paddingTop: /\bpt-\d+/,
  paddingRight: /\bpr-\d+/,
  paddingBottom: /\bpb-\d+/,
  paddingLeft: /\bpl-\d+/,
  margin: /\bm-\d+/,
  marginX: /\bmx-\d+/,
  marginY: /\bmy-\d+/,
  marginTop: /\bmt-\d+/,
  marginRight: /\bmr-\d+/,
  marginBottom: /\bmb-\d+/,
  marginLeft: /\bml-\d+/,
  width: /\bw-(auto|full|\d+|1\/2|1\/3|2\/3|1\/4|3\/4|1\/5|2\/5|3\/5|4\/5)\b/,
  height: /\bh-(auto|full|screen|\d+)\b/,
  borderRadius: /\brounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?\b/,
  display:
    /\b(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden)\b/,
  flexDirection: /\bflex-(row|row-reverse|col|col-reverse)\b/,
  justifyContent: /\bjustify-(start|end|center|between|around|evenly)\b/,
  alignItems: /\bitems-(start|end|center|baseline|stretch)\b/,
  gap: /\bgap-\d+/,
} as const;
