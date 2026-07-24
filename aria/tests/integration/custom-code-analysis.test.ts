import { describe, expect, it } from "vitest";
import { analyzeCustomCode } from "../../lib/security/analyzeCustomCode";

describe("custom code analysis", () => {
  it("extracts normalized external origins from custom code sections", () => {
    const analysis = analyzeCustomCode([
      {
        label: "head",
        code: [
          '<script src="https://cdn.example.com/app.js"></script>',
          '<link rel="stylesheet" href="https://assets.example.com/site.css">',
          '<img src="https://images.example.com/hero.png">',
          '<iframe src="https://player.example.com/embed/123"></iframe>',
        ].join("\n"),
      },
    ]);

    expect(analysis.scriptSrc).toEqual(["https://cdn.example.com"]);
    expect(analysis.styleSrc).toEqual(["https://assets.example.com"]);
    expect(analysis.imgSrc).toEqual(["https://images.example.com"]);
    expect(analysis.frameSrc).toEqual(["https://player.example.com"]);
    expect(analysis.warnings).toEqual([]);
  });

  it("tracks inline script and event handler risk signals", () => {
    const analysis = analyzeCustomCode([
      {
        label: "body",
        code: [
          '<script>fetch("https://api.example.com/events");</script>',
          '<button onclick="alert(1)">Click</button>',
        ].join("\n"),
      },
    ]);

    expect(analysis.inlineScripts).toBe(1);
    expect(analysis.inlineEventHandlers).toBe(1);
    expect(analysis.warnings).toContain(
      "Inline custom scripts detected; published CSP will need a relaxed script execution posture.",
    );
    expect(analysis.warnings).toContain(
      "Inline event handlers detected in custom code.",
    );
    expect(analysis.warnings).toContain(
      "body: inline code may create additional runtime network requirements",
    );
  });

  it("normalizes same-origin relative paths and flags unsupported values", () => {
    const analysis = analyzeCustomCode([
      {
        label: "footer",
        code: [
          '<script src="/scripts/local.js"></script>',
          '<script src="javascript:alert(1)"></script>',
        ].join("\n"),
      },
    ]);

    expect(analysis.scriptSrc).toEqual(["'self'"]);
    expect(analysis.unknownPatterns).toContain(
      "footer:script src:javascript:alert(1)",
    );
    expect(analysis.warnings).toContain(
      'footer: invalid or unsupported script src value "javascript:alert(1)"',
    );
  });
});
