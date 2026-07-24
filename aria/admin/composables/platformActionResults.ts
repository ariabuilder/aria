import {
  AdapterInfoSchema,
  AdapterMetricsSchema,
  type AdapterInfo,
  type AdapterMetrics,
} from "../../lib/storage/adapterMetricsSchemas";

export function parseAdapterInfoPayload(data: unknown): AdapterInfo {
  return AdapterInfoSchema.parse(data);
}

export function parseAdapterMetricsPayload(data: unknown): AdapterMetrics | null {
  if (data === null) {
    return null;
  }
  return AdapterMetricsSchema.parse(data);
}
