import { describe, expect, it } from "vitest";
import {
  extractImportSource,
  parseWxrSource,
} from "../../../lib/wordpress-import/source";

const encoder = new TextEncoder();

function bytes(input: string): Uint8Array {
  return encoder.encode(input);
}

describe("WordPress import source extraction", () => {
  it("accepts WXR/XML exports", async () => {
    await expect(
      extractImportSource({
        filename: "wordpress-export.xml",
        bytes: bytes("<rss><channel><title>Example</title></channel></rss>"),
      }),
    ).resolves.toMatchObject({
      sourceType: "wxr",
      filename: "wordpress-export.xml",
    });
  });

  it("rejects SQL exports for v1", async () => {
    await expect(
      extractImportSource({
        filename: "wordpress.sql",
        bytes: bytes("CREATE TABLE wp_posts (ID bigint unsigned NOT NULL);"),
      }),
    ).rejects.toThrow("Upload a WordPress WXR/XML export file.");
  });

  it("rejects ZIP uploads for v1", async () => {
    await expect(
      extractImportSource({
        filename: "wordpress-export.zip",
        bytes: bytes("not inspected in v1"),
      }),
    ).rejects.toThrow("Upload a WordPress WXR/XML export file.");
  });
});

describe("WordPress WXR parsing", () => {
  it("normalizes authors, terms, media URLs, comments, and builder drops", async () => {
    const graph = await parseWxrSource(`<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0"
        xmlns:content="http://purl.org/rss/1.0/modules/content/"
        xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
        xmlns:wp="http://wordpress.org/export/1.2/"
        xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel>
          <title>Example</title>
          <link>https://example.test</link>
          <wp:base_site_url>https://example.test</wp:base_site_url>
          <wp:base_blog_url>https://example.test</wp:base_blog_url>
          <wp:wxr_version>1.2</wp:wxr_version>
          <wp:author>
            <wp:author_login>jane</wp:author_login>
            <wp:author_email>jane@example.test</wp:author_email>
            <wp:author_display_name>Jane Editor</wp:author_display_name>
            <wp:author_first_name>Jane</wp:author_first_name>
            <wp:author_last_name>Editor</wp:author_last_name>
          </wp:author>
          <item>
            <title>Hello World</title>
            <wp:post_id>10</wp:post_id>
            <wp:post_name>hello-world</wp:post_name>
            <wp:post_type>post</wp:post_type>
            <wp:status>publish</wp:status>
            <dc:creator>jane</dc:creator>
            <content:encoded><![CDATA[<p>Hello</p>]]></content:encoded>
            <category domain="category" nicename="news"><![CDATA[News]]></category>
            <category domain="wp_theme" nicename="twentytwentyfive"><![CDATA[twentytwentyfive]]></category>
            <wp:postmeta>
              <wp:meta_key>subtitle</wp:meta_key>
              <wp:meta_value>Clean custom field</wp:meta_value>
            </wp:postmeta>
            <wp:comment>
              <wp:comment_id>1</wp:comment_id>
            </wp:comment>
          </item>
          <item>
            <title>Hero Image</title>
            <wp:post_id>11</wp:post_id>
            <wp:post_name>hero-image</wp:post_name>
            <wp:post_type>attachment</wp:post_type>
            <wp:attachment_url>https://example.test/wp-content/uploads/hero.jpg</wp:attachment_url>
          </item>
          <item>
            <title>Builder Page</title>
            <wp:post_id>12</wp:post_id>
            <wp:post_name>builder-page</wp:post_name>
            <wp:post_type>page</wp:post_type>
            <content:encoded><![CDATA[[elementor-template id="99"]]]></content:encoded>
          </item>
          <item>
            <title>Global Styles</title>
            <wp:post_id>13</wp:post_id>
            <wp:post_name>wp-global-styles</wp:post_name>
            <wp:post_type>wp_global_styles</wp:post_type>
          </item>
          <item>
            <title>Pricing Table</title>
            <wp:post_id>14</wp:post_id>
            <wp:post_name>pricing-table</wp:post_name>
            <wp:post_type>tablepress_table</wp:post_type>
          </item>
        </channel>
      </rss>`);

    expect(graph.authors).toMatchObject([
      {
        id: "jane",
        login: "jane",
        email: "jane@example.test",
        displayName: "Jane Editor",
      },
    ]);
    expect(graph.terms).toEqual([
      { domain: "category", slug: "news", name: "News" },
    ]);
    expect(graph.counts).toMatchObject({
      posts: 1,
      pages: 1,
      attachments: 1,
      authors: 1,
      comments: 1,
      terms: 1,
      cleanCustomFields: 1,
      skippedBuilderItems: 1,
    });
    expect(
      graph.items.find((item) => item.kind === "attachment")?.attachmentUrl,
    ).toBe("https://example.test/wp-content/uploads/hero.jpg");
    expect(graph.items.find((item) => item.id === "12")?.content).toBe("");
    expect(graph.items.some((item) => item.id === "13")).toBe(false);
    expect(graph.items.some((item) => item.id === "14")).toBe(false);
    expect(graph.warnings).toContain(
      "Found 1 comment(s). Comments are deferred until Aria has comments support.",
    );
  });
});
