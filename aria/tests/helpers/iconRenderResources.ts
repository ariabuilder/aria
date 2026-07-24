import { createIconRenderResources } from "../../lib/icons/iconRenderResources";

const records = new Map(
  ["lucide:star", "lucide:circle-check", "lucide:rocket"].map((id) => [
    id,
    {
      id,
      body: '<path d="M2 2h20v20H2z"/>',
      viewBox: "0 0 24 24",
      width: 24,
      height: 24,
      contentHash: id.replace(/[^a-z0-9]/g, ""),
      hasInternalIds: false,
    },
  ]),
);

export function createTestIconRenderResources() {
  return createIconRenderResources(records);
}
