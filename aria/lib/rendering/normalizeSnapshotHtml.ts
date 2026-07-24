const LEGACY_GLOBAL_CSS_HREF = "/api/styles/global.css";
const CURRENT_GLOBAL_CSS_HREF = "/styles/global.css";

export function normalizeSnapshotHtml(html: string): string {
  return html.includes(LEGACY_GLOBAL_CSS_HREF)
    ? html.replaceAll(LEGACY_GLOBAL_CSS_HREF, CURRENT_GLOBAL_CSS_HREF)
    : html;
}
