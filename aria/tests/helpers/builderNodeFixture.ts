import type { BuilderNode } from "../../lib/types/nodes";

/** Author-friendly node shape used before schema defaults add an empty style map. */
export type BuilderNodeFixture = Omit<BuilderNode, "children" | "styles"> & {
  styles?: BuilderNode["styles"];
  children: BuilderNodeFixture[];
};
