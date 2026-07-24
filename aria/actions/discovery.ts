/**
 * Discovery read actions for Studio indexability and artifact previews.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  buildDiscoveryArtifacts,
  buildDiscoveryReport,
  buildGeneratedDiscoveryBaseline,
  DiscoveryArtifactsSchema,
  DiscoveryGeneratedBaselineSchema,
  DiscoveryReportSchema,
  loadDiscoveryContext,
  sanitizeDiscoveryReportForReader,
} from "../lib/crawl";
import { requireOperation } from "./_shared";
import { resolveEffectiveCapabilities } from "../lib/auth/types";
import { resolveUserPermissionProfile } from "../lib/authorship/permissionProfile";
import { listRedirectsFromAdapter } from "../lib/redirects/storage";

export const discovery = {
  getReport: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      const user = await requireOperation(context, "discovery.getReport");

      const adapter = await getStorageAdapterAsync(context.locals);
      const { siteSettings, pages } = await loadDiscoveryContext(adapter);
      const redirects = await listRedirectsFromAdapter(adapter, {
        includeDisabled: false,
      });

      const report = buildDiscoveryReport({
        siteSettings,
        pages,
        redirects,
      });

      const effective = resolveEffectiveCapabilities(
        resolveUserPermissionProfile(user),
      );
      const sanitizedReport = effective.includes("editDiscoverySettings")
        ? report
        : sanitizeDiscoveryReportForReader(user, report);

      return DiscoveryReportSchema.parse(sanitizedReport);
    },
  }),

  getArtifacts: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      await requireOperation(context, "discovery.getArtifacts");

      const adapter = await getStorageAdapterAsync(context.locals);
      const { siteSettings, pages, cmsEntries } = await loadDiscoveryContext(adapter);
      const artifacts = buildDiscoveryArtifacts({ siteSettings, pages, cmsEntries });
      return DiscoveryArtifactsSchema.parse(artifacts);
    },
  }),

  getGeneratedBaseline: defineAction({
    accept: "json",
    input: z.object({
      artifact: z.enum(["robots", "sitemap", "llms"]),
    }),
    handler: async (input, context) => {
      await requireOperation(context, "discovery.getGeneratedBaseline");

      const adapter = await getStorageAdapterAsync(context.locals);
      const { siteSettings, pages } = await loadDiscoveryContext(adapter);
      const content = buildGeneratedDiscoveryBaseline({
        artifact: input.artifact,
        siteSettings,
        pages,
        forEditorSeed: true,
      });

      return DiscoveryGeneratedBaselineSchema.parse({
        artifact: input.artifact,
        content,
        generatedAt: new Date().toISOString(),
      });
    },
  }),
};
