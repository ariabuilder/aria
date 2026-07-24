import { z } from "zod";
import { studioIcons } from "@/lib/icons";
import type { AdapterNetworkMetrics } from "@/lib/storage/adapterMetricsSchemas";

export const EdgePipelineServiceIdSchema = z.enum([
  "cdn",
  "ddos",
  "ssl",
  "waf",
  "bot",
]);

export const EdgePipelineNodeStatusSchema = z.enum([
  "active",
  "inactive",
  "unknown",
]);

export const EdgePipelineNodeSchema = z.object({
  id: EdgePipelineServiceIdSchema,
  label: z.string().min(1),
  icon: z.string().min(1),
  status: EdgePipelineNodeStatusSchema,
  tooltip: z.string().min(1),
});

export const EdgePipelineVariantSchema = z.enum(["list", "pipeline"]);

export type EdgePipelineServiceId = z.infer<typeof EdgePipelineServiceIdSchema>;
export type EdgePipelineNodeStatus = z.infer<typeof EdgePipelineNodeStatusSchema>;
export type EdgePipelineNode = z.infer<typeof EdgePipelineNodeSchema>;
export type EdgePipelineVariant = z.infer<typeof EdgePipelineVariantSchema>;

const EDGE_PIPELINE_NODES: ReadonlyArray<{
  id: EdgePipelineServiceId;
  label: string;
  icon: string;
}> = [
  { id: "cdn", label: "CDN", icon: studioIcons.globe },
  { id: "ddos", label: "DDoS", icon: studioIcons.shieldCheck },
  { id: "ssl", label: "SSL", icon: studioIcons.lock },
  { id: "waf", label: "WAF", icon: studioIcons.lightning },
  { id: "bot", label: "Bot", icon: studioIcons.moveHorizontal },
];

function resolveServiceStatus(
  value: boolean | undefined,
): EdgePipelineNodeStatus {
  if (value === true) {
    return "active";
  }
  if (value === false) {
    return "inactive";
  }
  return "unknown";
}

function statusLabel(status: EdgePipelineNodeStatus): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "inactive") {
    return "Inactive";
  }
  return "Status unknown";
}

function resolveMetricValue(
  network: AdapterNetworkMetrics | undefined,
  id: EdgePipelineServiceId,
): boolean | undefined {
  if (!network) {
    return undefined;
  }

  switch (id) {
    case "cdn":
      return network.globalCdn;
    case "ddos":
      return network.ddosProtection;
    case "ssl":
      return network.sslEnabled;
    case "waf":
      return network.wafEnabled;
    case "bot":
      return network.botProtection;
  }
}

export function buildEdgePipelineNodes(
  network: AdapterNetworkMetrics | undefined,
): EdgePipelineNode[] {
  const nodes = EDGE_PIPELINE_NODES.map((node) => {
    const status = resolveServiceStatus(resolveMetricValue(network, node.id));
    return EdgePipelineNodeSchema.parse({
      id: node.id,
      label: node.label,
      icon: node.icon,
      status,
      tooltip: `${node.label} — ${statusLabel(status)}`,
    });
  });

  return z.array(EdgePipelineNodeSchema).parse(nodes);
}

export function isEdgePipelineNodeActive(node: EdgePipelineNode): boolean {
  return node.status === "active";
}
