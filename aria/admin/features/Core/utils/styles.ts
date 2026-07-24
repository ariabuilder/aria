/**
 * Style/Class Utilities.
 */

/**
 * Status badge styles using CSS variables
 */
export type StatusType = "published" | "draft" | "success" | "warning" | "error" | "default";

export function getStatusClasses(status?: string): string {
  const statusMap: Record<StatusType, string> = {
    published: "bg-success/10 text-success",
    success: "bg-success/10 text-success",
    draft: "bg-warning/10 text-warning",
    warning: "bg-warning/10 text-warning",
    error: "bg-destructive/10 text-destructive",
    default: "bg-muted text-muted-foreground",
  };
  
  const key = (status?.toLowerCase() || "default") as StatusType;
  return statusMap[key] || statusMap.default;
}
