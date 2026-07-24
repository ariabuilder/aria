/**
 * User-facing messages for traffic metrics failures.
 */

export function formatTrafficErrorMessage(
  reason: string | undefined | null,
): string {
  switch (reason) {
    case "analytics_forbidden":
      return "Cloudflare denied analytics access for this zone. Verify the selected API token has Analytics Read and includes this zone, then refresh.";
    case "query_failed":
      return "Traffic data could not be loaded. Check your API token and zone ID.";
    case "credentials_invalid":
      return "Cloudflare rejected the API token. Verify permissions and try again.";
    case "credentials_missing":
      return "Add ARIA_CLOUDFLARE_ANALYTICS_TOKEN (or ARIA_CLOUDFLARE_API_TOKEN) and ARIA_CLOUDFLARE_ZONE_ID on the server.";
    case "host_mismatch":
      return "Zone ID does not match your site URL. Update credentials in settings.";
    case "no_traffic_for_host":
      return "No traffic found for your site URL host in this zone.";
    case "disabled":
      return "Studio traffic metrics are turned off in settings.";
    default:
      return "Traffic data is temporarily unavailable.";
  }
}
