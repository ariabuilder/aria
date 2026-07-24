import { describe, expect, it } from "vitest";
import { AdapterNetworkMetricsSchema } from "../../../../lib/storage/adapterMetricsSchemas";
import {
  buildEdgePipelineNodes,
  EdgePipelineNodeSchema,
  isEdgePipelineNodeActive,
} from "../../../../admin/features/Studio/metrics/lib/edgePipeline";

describe("buildEdgePipelineNodes", () => {
  it("returns five pipeline nodes with active CDN and DDoS when enabled", () => {
    const network = AdapterNetworkMetricsSchema.parse({
      status: "online",
      ddosProtection: true,
      globalCdn: true,
      edgeCaching: true,
      sslEnabled: true,
      wafEnabled: false,
      botProtection: undefined,
    });

    const nodes = buildEdgePipelineNodes(network);

    expect(nodes).toHaveLength(5);
    expect(nodes.every((node) => EdgePipelineNodeSchema.safeParse(node).success)).toBe(
      true,
    );
    expect(nodes.find((node) => node.id === "cdn")?.status).toBe("active");
    expect(nodes.find((node) => node.id === "waf")?.status).toBe("inactive");
    expect(nodes.find((node) => node.id === "bot")?.status).toBe("unknown");
  });

  it("marks all nodes unknown when network is undefined", () => {
    const nodes = buildEdgePipelineNodes(undefined);
    expect(nodes.every((node) => node.status === "unknown")).toBe(true);
    expect(nodes.every((node) => !isEdgePipelineNodeActive(node))).toBe(true);
  });
});
