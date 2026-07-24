import { normalizeBaseUrl } from "../crawl/normalizeBaseUrl";

export async function pingSearchEnginesForSitemap(siteUrl?: string): Promise<void> {
  const baseUrl = normalizeBaseUrl(siteUrl);
  if (!baseUrl) {
    return;
  }

  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const pingTargets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];

  await Promise.allSettled(
    pingTargets.map(async (url) => {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Sitemap ping failed (${response.status})`);
      }
    }),
  );
}
