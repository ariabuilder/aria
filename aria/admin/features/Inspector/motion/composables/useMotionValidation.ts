/**
 * Aria Motion editor composables.
 */

import { usePropertySchema } from "../../composables/usePropertySchema";
import type { NodeMotion } from "../../../../../lib/motion/schemas/nodeMotion.schema";

export function useMotionValidation() {
  const { validate, safeParse, getDefault } = usePropertySchema();

  return {
    validateMotion: (value: unknown) => validate("motion", value),
    safeParseMotion: (value: unknown) => safeParse("motion", value),
    getDefaultMotion: (): NodeMotion => getDefault("motion") as NodeMotion,
  };
}
