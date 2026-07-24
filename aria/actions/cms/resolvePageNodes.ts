import { defineAction } from "astro:actions";
import { z } from "zod";
import {
  RenderCmsDataOptionsSchema,
  resolveCmsBoundNodes,
} from "../../lib/cms/resolveBoundNodes";
import { BuilderNodeSchema } from "../../lib/schemas/nodes";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { MediaCatalogRepository } from "../../lib/media/catalog/repository";
import { requireAuth } from "../_shared";

export const ResolvePageNodesRequestSchema = z
  .object({
    nodes: z.array(BuilderNodeSchema),
    basePath: z.string().default("/"),
    cms: RenderCmsDataOptionsSchema.optional(),
  })
  .strict();

export const ResolvePageNodesResponseSchema = z
  .object({
    nodes: z.array(BuilderNodeSchema),
  })
  .strict();

export const resolvePageNodes = {
  resolve: defineAction({
    accept: "json",
    input: ResolvePageNodesRequestSchema,
    handler: async (input, context) => {
      await requireAuth(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const catalog = MediaCatalogRepository.tryCreate(context.locals);
      const nodes = await resolveCmsBoundNodes({
        nodes: input.nodes,
        adapter,
        cms: input.cms,
        basePath: input.basePath,
        catalog,
      });
      return ResolvePageNodesResponseSchema.parse({ nodes });
    },
  }),
};
