import { describe, expect, it } from "vitest";

import {
  collectUndefinedPropPaths,
  htmlToNodes,
  importHtmlToNodes,
} from "../../lib/blocks/htmlToNodes";
import type { BuilderNode } from "../../lib/types/nodes";
import { nodesToHtmlFragment } from "../../lib/blocks/nodesToHtml";

describe("importHtmlToNodes", () => {
  it("classifies border and placeholder utilities instead of custom classes", async () => {
    const result = await importHtmlToNodes(`
      <input
        class="flex-1 px-5 py-3.5 border placeholder-neutral-500 rounded-l-xl"
        type="email"
      />
    `);

    const [inputNode] = result.nodes;
    expect(inputNode.type).toBe("Input");
    expect(inputNode.classNames?.base).toEqual(
      expect.arrayContaining([
        "flex-1",
        "px-5",
        "py-3.5",
        "border",
        "placeholder-neutral-500",
        "rounded-l-xl",
      ]),
    );
    expect(inputNode.customClasses ?? []).toEqual([]);
    expect(result.report.createdCustomClasses).toEqual([]);
  });

  it("classifies negative spacing utilities instead of custom classes", async () => {
    const result = await importHtmlToNodes(`
      <div class="flex -mt-4 -mx-2 -top-1 -translate-x-1 hero-shell">
        Content
      </div>
    `);

    const [node] = result.nodes;
    expect(node.classNames?.base).toEqual(
      expect.arrayContaining([
        "flex",
        "-mt-4",
        "-mx-2",
        "-top-1",
        "-translate-x-1",
      ]),
    );
    expect(node.customClasses).toEqual(["hero-shell"]);
    expect(result.report.createdCustomClasses).toEqual(["hero-shell"]);
  });

  it("sanitizes unsafe markup and splits utility versus custom classes", async () => {
    const result = await importHtmlToNodes(`
      <div class="max-w-340 mx-auto hero-shell" onclick="alert(1)">
        <script>alert(1)</script>
        Imported hero
      </div>
    `);

    expect(result.nodes).toHaveLength(1);

    const [node] = result.nodes;
    expect(node.type).toBe("Container");
    expect(node.classNames?.base).toEqual(
      expect.arrayContaining(["max-w-340", "mx-auto"]),
    );
    expect(node.customClasses).toEqual(["hero-shell"]);
    expect(result.report.createdCustomClasses).toEqual(["hero-shell"]);
    expect(result.report.removedAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attribute: "onclick", tagName: "div" }),
      ]),
    );
    expect(result.report.removedElements).toEqual(
      expect.arrayContaining([expect.objectContaining({ tagName: "script" })]),
    );
  });

  it("preserves mixed text and inline svg children", async () => {
    const result = await importHtmlToNodes(`
      <a class="text-sm" href="#cta">
        Get started
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
      </a>
    `);

    expect(result.nodes).toHaveLength(1);

    const [linkNode] = result.nodes;
    expect(linkNode.type).toBe("Link");
    expect(linkNode.classNames?.base).toEqual(
      expect.arrayContaining(["text-sm"]),
    );
    expect(linkNode.props.href).toBe("#cta");
    expect(linkNode.children).toHaveLength(2);
    expect(linkNode.children[0]).toMatchObject({
      type: "Span",
      props: { text: "Get started " },
    });
    expect(linkNode.children[1]?.type).toBe("Svg");
    expect(linkNode.children[1]?.props.content).toContain("<path");
  });

  it("preserves text nodes adjacent to line breaks", async () => {
    const result = await importHtmlToNodes(
      '<h1>Built for<br>the <span class="text-teal-300">next</span><br>web.</h1>',
    );

    const heading = result.nodes[0];
    expect(heading?.children.map((child) => child.type)).toEqual([
      "Span",
      "Break",
      "Span",
      "Span",
      "Break",
      "Span",
    ]);
    expect(
      heading?.children
        .map((child) => child.props.text ?? child.props.content ?? "")
        .join(""),
    ).toBe("Built forthe nextweb.");

    const html = nodesToHtmlFragment(result.nodes);
    expect(html).toContain("Built for");
    expect(html).toContain("web.");
    expect(html.match(/<br \/>/g)).toHaveLength(2);
    expect(html).toContain('class="text-teal-300"');
  });

  it("converts background image utilities into container background styles", async () => {
    const result = await importHtmlToNodes(`
      <div class="px-4 sm:px-6 lg:px-8">
        <div class="h-120 md:h-[80dvh] flex flex-col bg-[url('https://images.unsplash.com/photo-1462917882517-e150004895fa?q=80&w=1920&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat rounded-2xl">
          <div class="mt-auto w-2/3 md:max-w-lg ps-5 pb-5 md:ps-10 md:pb-10">
            <h1 class="text-xl md:text-3xl lg:text-5xl text-white">
              Bringing Art to everything
            </h1>
          </div>
        </div>
      </div>
    `);

    expect(result.nodes).toHaveLength(1);

    const [outerContainer] = result.nodes;
    expect(outerContainer.type).toBe("Container");
    expect(outerContainer.children).toHaveLength(1);

    const heroNode = outerContainer.children[0];
    expect(heroNode?.type).toBe("Container");
    expect(heroNode?.classNames?.base).toEqual(
      expect.arrayContaining([
        "h-120",
        "md:h-[80dvh]",
        "flex",
        "flex-col",
        "rounded-2xl",
      ]),
    );
    expect(heroNode?.classNames?.base).not.toEqual(
      expect.arrayContaining([
        "bg-[url('https://images.unsplash.com/photo-1462917882517-e150004895fa?q=80&w=1920&auto=format&fit=crop')]",
        "bg-cover",
        "bg-center",
        "bg-no-repeat",
      ]),
    );
    expect(heroNode?.styles.backgroundImage?.base).toBe(
      'url("https://images.unsplash.com/photo-1462917882517-e150004895fa?q=80&w=1920&auto=format&fit=crop")',
    );
    expect(heroNode?.styles.backgroundSize?.base).toBe("cover");
    expect(heroNode?.styles.backgroundPosition?.base).toBe("center");
    expect(heroNode?.styles.backgroundRepeat?.base).toBe("no-repeat");

    expect(heroNode?.children).toHaveLength(1);

    const contentNode = heroNode?.children[0];
    expect(contentNode?.classNames?.base).toEqual(
      expect.arrayContaining(["mt-auto"]),
    );
  });

  it("normalizes jsx-style pasted fragments without swallowing siblings", async () => {
    const result = await importHtmlToNodes(`
      <div class="card">
        <h4 class="title">Basic</h4>
        <p class="desc">Lorem ipsum dolor sit amet.</p>
        <div class="divider" />
        <ul>
          <li class="row">
            <i class="pi pi-check-circle text-green-500" />
            <span class="copy">Arcu vitae elementum</span>
          </li>
        </ul>
        <Button label="Buy Now" rounded class="w-full" />
      </div>
      <div class="card">
        <h4 class="title">Premium</h4>
      </div>
    `);

    expect(result.nodes).toHaveLength(2);

    const [basicCard, premiumCard] = result.nodes;
    expect(basicCard.type).toBe("Container");
    expect(basicCard.children.map((child) => child.type)).toEqual([
      "Heading",
      "Paragraph",
      "Container",
      "List",
      "Button",
    ]);

    expect(basicCard.children[0]).toMatchObject({
      type: "Heading",
      props: { text: "Basic" },
      children: [],
    });
    expect(basicCard.children[1]).toMatchObject({
      type: "Paragraph",
      props: { content: "Lorem ipsum dolor sit amet." },
      children: [],
    });

    const firstListItem = basicCard.children[3]?.children[0];
    expect(firstListItem?.type).toBe("ListItem");
    expect(firstListItem?.children[0]).toMatchObject({
      type: "Icon",
      children: [],
    });
    expect(firstListItem?.children[1]).toMatchObject({
      type: "Span",
      props: { content: " Arcu vitae elementum" },
      children: [],
    });

    expect(basicCard.children[4]).toMatchObject({
      type: "Button",
      props: { label: "Buy Now" },
    });
    expect(basicCard.children[4]?.classNames?.base).toEqual(
      expect.arrayContaining(["w-full"]),
    );

    expect(premiumCard.children[0]).toMatchObject({
      type: "Heading",
      props: { text: "Premium" },
      children: [],
    });
  });

  it("defaults pasted unordered lists to no marker while preserving ordered semantics", async () => {
    const imported = await importHtmlToNodes(`
      <section>
        <ul class="mt-12 space-y-4"><li>Unordered</li></ul>
        <ol><li>Ordered</li></ol>
        <ul style="list-style-type: square"><li>Explicit marker</li></ul>
        <ul class="list-none pl-6 w-full"><li>Explicit sizing</li></ul>
      </section>
    `);

    const [unordered, ordered, explicit, padded] = imported.nodes[0]!.children;

    expect(unordered).toMatchObject({
      type: "List",
      props: { ordered: false },
      styles: {
        widthSizing: { base: "hug" },
        listStyleType: { base: "none" },
        padding: { base: "0" },
      },
    });
    expect(ordered).toMatchObject({
      type: "List",
      props: { ordered: true },
      styles: {
        widthSizing: { base: "hug" },
        listStyleType: { base: "decimal" },
      },
    });
    expect(explicit?.styles.listStyleType).toEqual({ base: "square" });
    expect(padded?.styles.padding).toBeUndefined();
    expect(padded?.styles.widthSizing).toBeUndefined();
    expect(padded?.classNames?.base).toEqual(
      expect.arrayContaining(["list-none", "pl-6", "w-full"]),
    );

    const [legacyUnordered] = htmlToNodes(`<ul><li>Legacy path</li></ul>`);
    expect(legacyUnordered).toMatchObject({
      type: "List",
      props: { ordered: false },
      styles: {
        widthSizing: { base: "hug" },
        listStyleType: { base: "none" },
        padding: { base: "0" },
      },
    });
  });

  it("keeps text-only spans as span nodes instead of paragraph text nodes", async () => {
    const result = await importHtmlToNodes(`
      <span class="eyebrow">Inline copy</span>
    `);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      type: "Span",
      props: { content: "Inline copy" },
      children: [],
    });
  });

  it("renders mixed-content inline imports without nested paragraph wrappers", async () => {
    const result = await importHtmlToNodes(`
      <ul>
        <li class="row"><i class="pi pi-check-circle"></i> Plain label</li>
      </ul>
      <button class="cta"><i class="pi pi-star"></i> Buy now</button>
    `);

    const html = nodesToHtmlFragment(result.nodes);

    expect(html).toContain('<li class="row">');
    expect(html).toContain("<span> Plain label</span>");
    expect(html).not.toContain('<li class="row">\n    <p>');
    expect(html).toContain(
      '<button class="cta" data-button-variant="primary">',
    );
    expect(html).toContain("<span> Buy now</span>");
    expect(html).not.toContain(
      '<button class="cta" data-button-variant="primary">\n  <p>',
    );
  });

  it("imports footer logo link/image shape without undefined props", async () => {
    const result = await importHtmlToNodes(`
      <footer class="bg-gray-900">
        <div class="max-w-7xl mx-auto px-6 py-16">
          <a href="#" class="flex items-center">
            <img
              class="h-10 w-auto"
              src="https://cdn.example.com/logo.svg"
              alt="Brand"
            />
          </a>
          <nav class="mt-8">
            <a href="#" class="text-sm">Product</a>
          </nav>
        </div>
      </footer>
    `);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.type).toBe("Footer");
    expect(collectUndefinedPropPaths(result.nodes)).toEqual([]);

    const brandLink = result.nodes[0]?.children[0]?.children[0];
    expect(brandLink?.type).toBe("Link");
    expect(brandLink?.children[0]?.type).toBe("Image");
    expect(brandLink?.children[0]?.classNames?.base).toEqual(
      expect.arrayContaining(["h-10", "w-auto"]),
    );
    expect(brandLink?.props).not.toHaveProperty("target");
    expect(brandLink?.props).not.toHaveProperty("rel");

    const html = nodesToHtmlFragment(result.nodes);
    expect(html).toContain('href="#"');
    expect(html).toContain('class="h-10');
    expect(html).toMatch(/<a[^>]*>[\s\S]*<img[^>]*class="[^"]*h-10/);
  });

  it("maps inline semantic tags to span nodes", async () => {
    const result = await importHtmlToNodes(`
      <p>Read our <strong>privacy policy</strong> and <em>terms</em>.</p>
    `);

    const paragraph = result.nodes[0];
    expect(paragraph?.type).toBe("Paragraph");
    expect(paragraph?.children.every((child) => child.type === "Span")).toBe(
      true,
    );
    expect(paragraph?.children.length).toBeGreaterThanOrEqual(3);
  });

  it("hoists subscribe button text from a single child", async () => {
    const result = await importHtmlToNodes(`
      <form>
        <button type="submit" class="rounded-md">Subscribe</button>
      </form>
    `);

    const form = result.nodes[0];
    const button = form?.children[0];
    expect(button?.type).toBe("Button");
    expect(button?.props.text).toBe("Subscribe");
    expect(button?.children).toEqual([]);
  });

  it("preserves motion-word heading spans with spaces and per-word styles", async () => {
    const result = await importHtmlToNodes(`
      <h2 class="text-slate-900 text-3xl font-bold leading-tight">
        <span style="opacity: 1;">
          <span class="motion-word" style="display: inline-block; opacity: 1; transform: translateY(0px);">Sustainable</span>
          <span class="motion-word" style="display: inline-block; opacity: 1; transform: translateY(0px);">Solutions</span>
          <span class="motion-word" style="display: inline-block; opacity: 1; transform: translateY(0px);">for</span>
          <span class="motion-word" style="display: inline-block; opacity: 1; transform: translateY(0px);">a</span>
          <span class="motion-word" style="display: inline-block; opacity: 1; transform: translateY(0px);">Greener</span>
          <span class="motion-word" style="display: inline-block; opacity: 1; transform: translateY(0px);">Future</span>
        </span>
      </h2>
    `);

    expect(result.nodes).toHaveLength(1);

    const heading = result.nodes[0];
    expect(heading?.type).toBe("Heading");
    expect(heading?.children).toHaveLength(1);

    const wrapper = heading?.children[0];
    expect(wrapper?.type).toBe("Span");
    expect(wrapper?.children).toHaveLength(6);

    const words =
      wrapper?.children?.map(
        (child) => child.props?.content ?? child.props?.text,
      ) ?? [];
    expect(words.join("").replace(/\s+/g, " ").trim()).toBe(
      "Sustainable Solutions for a Greener Future",
    );

    for (const wordSpan of wrapper?.children ?? []) {
      expect(wordSpan.type).toBe("Span");
      expect(wordSpan.customClasses).toEqual(
        expect.arrayContaining(["motion-word"]),
      );
      expect(wordSpan.styles?.display?.base).toBe("inline-block");
    }

    const html = nodesToHtmlFragment(result.nodes);
    const exportedText = html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(exportedText).toBe("Sustainable Solutions for a Greener Future");
  });

  it("imports about-section header grid with two column containers", async () => {
    const result = await importHtmlToNodes(`
      <section class="py-20">
        <div class="max-w-7xl mx-auto px-4">
          <div class="grid lg:grid-cols-2 gap-8 lg:gap-16 items-end mb-12">
            <div>
              <span class="uppercase">About Us</span>
              <h2>Title column</h2>
            </div>
            <div>
              <p>Paragraph column</p>
            </div>
          </div>
        </div>
      </section>
    `);

    const section = result.nodes[0];
    const outer = section?.children?.[0];
    const headerGrid = outer?.children?.[0];

    expect(headerGrid?.classNames?.base).toEqual(
      expect.arrayContaining(["grid", "lg:grid-cols-2"]),
    );
    expect(headerGrid?.children).toHaveLength(2);
  });

  it("imports a two-column grid header with two direct column containers", async () => {
    const result = await importHtmlToNodes(`
      <div class="grid lg:grid-cols-2 gap-8 lg:gap-16 items-end mb-12">
        <div>
          <span class="uppercase">About Us</span>
          <h2>Title column</h2>
        </div>
        <div>
          <p>Paragraph column</p>
        </div>
      </div>
    `);

    const grid = result.nodes[0];
    expect(grid?.type).toBe("Container");
    expect(grid?.classNames?.base).toEqual(
      expect.arrayContaining(["grid", "lg:grid-cols-2"]),
    );
    expect(grid?.children).toHaveLength(2);
    expect(grid?.children?.[0]?.type).toBe("Container");
    expect(grid?.children?.[1]?.type).toBe("Container");
    expect(
      grid?.children?.[0]?.children?.some((c) => c.type === "Heading"),
    ).toBe(true);
    expect(
      grid?.children?.[1]?.children?.some((c) => c.type === "Paragraph"),
    ).toBe(true);
  });

  it("preserves surrounding spaces around inline child elements", async () => {
    const result = await importHtmlToNodes(`
      <p>Hello <span>world</span> again</p>
    `);

    const html = nodesToHtmlFragment(result.nodes);

    expect(html).toContain("<p>");
    expect(html).toContain("<span>Hello </span>");
    expect(html).toContain("<span>world</span>");
    expect(html).toContain("<span> again</span>");
  });

  it("imports leading style blocks as code nodes with render enabled", async () => {
    const result = await importHtmlToNodes(`
      <style>
        @keyframes marquee-left {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .marquee-left {
          animation: marquee-left 20s linear infinite;
        }
      </style>
      <section class="py-12">
        <div class="marquee-left">Scrolling</div>
      </section>
    `);

    expect(result.report.extractedStyleBlocks).toBe(1);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.nodes[0]?.type).toBe("code");
    expect(result.nodes[0]?.props?.renderMode).toBe("render");
    expect(String(result.nodes[0]?.props?.content)).toContain(
      "@keyframes marquee-left",
    );
    expect(String(result.nodes[0]?.props?.content)).toMatch(/<style[\s>]/i);
    expect(result.nodes[1]?.type).toBe("Section");
  });

  it("imports style blocks from head before body markup", async () => {
    const result = await importHtmlToNodes(`
      <html>
        <head>
          <style>.head-only { color: red; }</style>
        </head>
        <body>
          <section><p>Body</p></section>
        </body>
      </html>
    `);

    expect(result.report.extractedStyleBlocks).toBe(1);
    expect(result.nodes[0]?.type).toBe("code");
    expect(String(result.nodes[0]?.props?.content)).toContain(".head-only");
    expect(result.nodes.some((node) => node.type === "Section")).toBe(true);
  });

  it("imports multiple style blocks as separate code nodes in order", async () => {
    const result = await importHtmlToNodes(`
      <style>.first { opacity: 1; }</style>
      <style>.second { opacity: 0.5; }</style>
      <div class="first second">Content</div>
    `);

    expect(result.report.extractedStyleBlocks).toBe(2);
    expect(result.nodes[0]?.type).toBe("code");
    expect(result.nodes[1]?.type).toBe("code");
    expect(String(result.nodes[0]?.props?.content)).toContain(".first");
    expect(String(result.nodes[1]?.props?.content)).toContain(".second");
    expect(result.nodes[2]?.type).toBe("Container");
  });

  it("rejects unsafe style blocks but still imports markup", async () => {
    const result = await importHtmlToNodes(`
      <style>.bad { width: expression(alert(1)); }</style>
      <section><p>Safe</p></section>
    `);

    expect(result.report.extractedStyleBlocks).toBe(0);
    expect(result.report.rejectedStyleBlocks).toBe(1);
    expect(result.nodes.some((node) => node.type === "code")).toBe(false);
    expect(result.nodes.some((node) => node.type === "Section")).toBe(true);
  });

  it("imports style alongside forbidden script tags", async () => {
    const result = await importHtmlToNodes(`
      <style>.ok { color: green; }</style>
      <script>alert("nope")</script>
      <section>Content</section>
    `);

    expect(result.report.extractedStyleBlocks).toBe(1);
    expect(result.nodes[0]?.type).toBe("code");
    expect(result.nodes.some((node) => node.type === "Section")).toBe(true);
    expect(
      result.nodes.some(
        (node) =>
          node.type?.toLowerCase() === "script" ||
          node.props?.text === 'alert("nope")',
      ),
    ).toBe(false);
  });

  it("imports a full html document with head styles and section body", async () => {
    const result = await importHtmlToNodes(`<!DOCTYPE html>
      <html>
        <head>
          <style>.hero { background: #111; color: #fff; }</style>
        </head>
        <body>
          <section class="hero">
            <h1>Hero title</h1>
            <button class="btn">Go</button>
          </section>
        </body>
      </html>`);

    expect(result.report.extractedStyleBlocks).toBe(1);
    expect(result.nodes.some((node) => node.type === "code")).toBe(true);
    expect(result.nodes.some((node) => node.type === "Section")).toBe(true);
    expect(
      result.nodes.some((node) => node.customClasses?.includes("hero")),
    ).toBe(true);
  });

  it("does not produce tag-like span soup for structural hero fragments", async () => {
    const result = await importHtmlToNodes(`
      <section class="hero" id="home">
        <div class="hero-content">
          <p class="hero-eyebrow">Since 1991</p>
          <h1><span>Leaders</span> in Quality</h1>
          <a href="#contact" class="btn btn-primary">Get a Quote</a>
        </div>
      </section>
    `);

    const spanTagTexts = result.nodes
      .flatMap(function collect(node): BuilderNode[] {
        return [node, ...(node.children?.flatMap(collect) ?? [])];
      })
      .filter((node) => node.type === "Span")
      .map((node) => String(node.props?.text ?? ""))
      .filter((text) => /^[<\/>!]/.test(text));

    expect(spanTagTexts).toEqual([]);
    expect(result.nodes.some((node) => node.type === "Section")).toBe(true);
  });

  it("flattens picture elements to a single image node", async () => {
    const result = await importHtmlToNodes(`
      <div class="py-6">
        <picture>
          <source
            srcset="/_astro/hero.DlKDY3ml_ZvbIwv.webp 200w"
            type="image/webp"
            sizes="(max-width: 800px) 100vw, 620px"
          />
          <img
            src="/_astro/hero.DlKDY3ml_Z1MqY6c.png"
            alt="Astronaut in the air"
            width="520"
            height="424"
            loading="eager"
          />
        </picture>
      </div>
    `);

    const container = result.nodes[0];
    expect(container?.type).toBe("Container");
    expect(container?.children).toHaveLength(1);

    const image = container?.children[0];
    expect(image?.type).toBe("Image");
    expect(image?.props.src).toBe("/_astro/hero.DlKDY3ml_Z1MqY6c.png");
    expect(image?.props.alt).toBe("Astronaut in the air");
    expect(image?.props).not.toHaveProperty("srcset");
    expect(image?.props).not.toHaveProperty("sizes");
    expect(image?.children ?? []).toHaveLength(0);
  });

  it("does not import responsive img attrs from pasted markup", async () => {
    const result = await importHtmlToNodes(`
      <img
        src="/uploads/hero.jpg"
        srcset="/_astro/hero.png 200w, /_astro/hero-2x.png 400w"
        sizes="(max-width: 800px) 100vw, 620px"
        alt="Hero"
      />
    `);

    const [image] = result.nodes;
    expect(image?.type).toBe("Image");
    expect(image?.props.src).toBe("/uploads/hero.jpg");
    expect(image?.props.alt).toBe("Hero");
    expect(image?.props).not.toHaveProperty("srcset");
    expect(image?.props).not.toHaveProperty("sizes");
    expect(result.report.removedAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attribute: "srcset", tagName: "img" }),
        expect.objectContaining({ attribute: "sizes", tagName: "img" }),
      ]),
    );
  });

  it("skips non-css style types", async () => {
    const result = await importHtmlToNodes(`
      <style type="text/template">{{ not css }}</style>
      <section>Content</section>
    `);

    expect(result.report.extractedStyleBlocks).toBe(0);
    expect(result.report.rejectedStyleBlocks).toBe(1);
    expect(result.nodes.every((node) => node.type !== "code")).toBe(true);
  });
});
