import { z } from "zod";

export const PageSnapshotStageSchema = z.enum(["draft", "published"]);

export type PageSnapshotStage = z.infer<typeof PageSnapshotStageSchema>;
