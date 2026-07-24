import { describe, expect, it } from "vitest";
import {
  buildMarkupCandidates,
  extractClipboardFragment,
  importHtmlFromClipboard,
  pickBestMarkupForImport,
  resolveClipboardMarkup,
  shouldPreferPlainClipboardHtml,
  unwrapEditorSourceHtml,
} from "../../../admin/features/Nodes/events/clipboardMarkup";

const HERO_PLAIN = `<section class="hero" id="home">
  <div class="hero-content">
    <h1>Ontario's Trusted Drilling Partner</h1>
    <a href="#contact" class="btn btn-primary">Get a Quote</a>
  </div>
</section>`;

const EDITOR_HTML_WRAPPER = `<html><body><!--StartFragment--><pre style="font-family: monospace">&lt;section class="hero" id="home"&gt;
  &lt;div class="hero-content"&gt;
    &lt;h1&gt;Ontario's Trusted Drilling Partner&lt;/h1&gt;
    &lt;a href="#contact" class="btn btn-primary"&gt;Get a Quote&lt;/a&gt;
  &lt;/div&gt;
&lt;/section&gt;</pre><!--EndFragment--></body></html>`;

const TOKENIZED_HTML = `<html><body>
  <span>&lt;</span><span>section</span><span> class=</span><span>"hero"</span>
</body></html>`;

const FLOWRIFT_PLAIN = `<div class="bg-white lg:pb-12">
  <header class="flex items-center justify-between py-4">
    <a href="/" class="inline-flex items-center gap-2.5">Flowrift</a>
  </header>
</div>`;

const FLOWRIFT_HTML = `<div class="bg-white lg:pb-12">
  <header class="flex items-center justify-between py-4">
    <a href="/" class="inline-flex items-center gap-2.5">Flowrift</a>
  </header>
</div>`;

describe("clipboard markup helpers", () => {
  it("extracts StartFragment content", () => {
    expect(extractClipboardFragment(EDITOR_HTML_WRAPPER)).toContain("<pre");
    expect(extractClipboardFragment(EDITOR_HTML_WRAPPER)).not.toContain(
      "StartFragment",
    );
  });

  it("unwraps editor pre wrapper", () => {
    const unwrapped = unwrapEditorSourceHtml(EDITOR_HTML_WRAPPER);
    expect(unwrapped).toContain('<section class="hero"');
  });

  it("prefers plain text when html is a single pre-wrapped source fragment", () => {
    expect(shouldPreferPlainClipboardHtml(HERO_PLAIN, EDITOR_HTML_WRAPPER)).toBe(
      true,
    );
  });

  it("builds multiple candidates for editor clipboard", () => {
    const candidates = buildMarkupCandidates({
      clipboardText: HERO_PLAIN,
      clipboardHtml: EDITOR_HTML_WRAPPER,
    });
    expect(candidates.map((c) => c.id)).toEqual(
      expect.arrayContaining(["plain", "html", "fragment"]),
    );
  });
});

describe("pickBestMarkupForImport", () => {
  it("picks plain structural markup over tokenized html", async () => {
    const candidates = buildMarkupCandidates({
      clipboardText: HERO_PLAIN,
      clipboardHtml: TOKENIZED_HTML,
    });
    const best = await pickBestMarkupForImport(candidates);
    expect(best?.candidateId).toBe("plain");
    expect(best?.nodes.some((n) => n.type === "Section")).toBe(true);
  });

  it("accepts structural flowrift html", async () => {
    const candidates = buildMarkupCandidates({
      clipboardText: FLOWRIFT_PLAIN,
      clipboardHtml: FLOWRIFT_HTML,
    });
    const best = await pickBestMarkupForImport(candidates);
    expect(best).not.toBeNull();
    expect(
      best?.nodes.some(
        (n) => n.type === "Container" || n.type === "Header",
      ),
    ).toBe(true);
  });
});

describe("resolveClipboardMarkup", () => {
  it("imports plain markup when paste event includes editor html wrapper", async () => {
    const markup = await resolveClipboardMarkup(
      async () => "",
      async () => "",
      {
        clipboardText: HERO_PLAIN,
        clipboardHtml: EDITOR_HTML_WRAPPER,
      },
    );

    expect(markup).toContain('<section class="hero"');
    expect(markup).not.toContain("&lt;section");
  });

  it("falls back to navigator plain text when html is editor-wrapped", async () => {
    const markup = await resolveClipboardMarkup(
      async () => HERO_PLAIN,
      async () => EDITOR_HTML_WRAPPER,
    );

    expect(markup).toContain('<section class="hero"');
  });
});

describe("importHtmlFromClipboard", () => {
  it("returns structural nodes for hero plain text", async () => {
    const result = await importHtmlFromClipboard(
      async () => "",
      async () => "",
      { clipboardText: HERO_PLAIN, clipboardHtml: EDITOR_HTML_WRAPPER },
    );

    expect(result?.nodes.some((n) => n.type === "Section")).toBe(true);
    expect(result?.candidateId).toBe("plain");
  });
});
