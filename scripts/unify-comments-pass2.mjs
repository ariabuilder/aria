/**
 * Pass 2: rewrite brochure openers + drop restating JSDoc.
 * Usage: node scripts/unify-comments-pass2.mjs [--dry-run] [path...]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");
const pathArgs = process.argv.slice(2).filter((a) => a !== "--dry-run");

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".astro", ".mjs", ".cjs", ".d.ts"]);
const SKIP = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}migrations${path.sep}`,
  `${path.sep}openapi${path.sep}`,
  `${path.sep}i18n${path.sep}messages${path.sep}`,
  `${path.sep}storage${path.sep}generated${path.sep}`,
];

const KEEP_TAG =
  /@(deprecated|default|param|returns?|throws|example|see|template|typeParam)\b/;

const OPENER =
  /^(Manages|Handles|Provides|Ensures|Facilitates|Coordinates|Implements|Enables|Offers|Delivers|Supports)\b/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".astro", ".wrangler"].includes(entry.name)) continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name)) && !SKIP.some((s) => full.includes(s))) {
      out.push(full);
    }
  }
  return out;
}

function jsdocProse(block) {
  return block
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("@"));
}

function rewriteOpenerProse(proseLines) {
  if (!proseLines.length) return null;
  let joined = proseLines.join(" ").replace(/\s+/g, " ").trim();

  // Drop brochure opener verb; keep the object clause
  if (OPENER.test(joined)) {
    joined = joined
      .replace(OPENER, "")
      .replace(/^\s*(type-safe|centralized|unified|intelligent|comprehensive|robust)\s+/i, "")
      .replace(/^\s+(access to|a |an |the )/i, "")
      .trim();
    // "drag-drop operations for X" → keep as-is after trim
    joined = joined.charAt(0).toUpperCase() + joined.slice(1);
  }

  joined = joined
    .replace(/\bwith (100% )?type safety\.?/gi, ".")
    .replace(/\bwith proper lifecycle management\.?/gi, ".")
    .replace(/\bwith reactive state management\.?/gi, ".")
    .replace(/\bwith singleton state\b/gi, "")
    .replace(/\bfor (optimal|maximum) performance\.?/gi, ".")
    .replace(/\bin the Aria visual page builder\.?/gi, ".")
    .replace(/\bfor the Aria( visual)?( page)? builder\.?/gi, ".")
    .replace(/\bProvides\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .trim();

  const sentences =
    joined.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [
      joined,
    ];
  let keep = sentences.slice(0, 2).join(" ");
  if (keep.length > 160) keep = keep.slice(0, 140).replace(/\s+\S*$/, "");
  if (!keep) return null;
  keep = keep.charAt(0).toUpperCase() + keep.slice(1);
  if (!/[.!?]$/.test(keep)) keep += ".";
  keep = keep.replace(/,\s*\.$/, ".");
  return keep;
}

function formatJsdoc(prose, indent, tags = []) {
  const tagBlock = tags.length ? "\n" + tags.map((t) => `${indent} * ${t}`).join("\n") : "";
  if (prose.length <= 92) {
    return `${indent}/**\n${indent} * ${prose}${tagBlock}\n${indent} */`;
  }
  const words = prose.split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  return `${indent}/**\n${indent} * ${words.slice(0, mid).join(" ")}\n${indent} * ${words.slice(mid).join(" ")}${tagBlock}\n${indent} */`;
}

function isRestating(body, nextLine) {
  const b = body.replace(/\s+/g, " ").trim();
  if (!b || KEEP_TAG.test(b) || b.length > 110) return false;
  if (
    /\b(e\.g\.|eg\.|must |should |only |never |avoid |null when|null for|in milliseconds|defaults? to|required from|backwards-compatible|same as |see |note:|because|so that|otherwise|workaround)\b/i.test(
      b,
    )
  ) {
    return false;
  }

  const prop = nextLine.match(/^\s*(?:readonly\s+)?(\w+)\s*[?:]/);
  const decl = nextLine.match(
    /(?:(?:export|async|readonly|public|private|protected|static)\s+)*(?:(?:async|function|class|interface|type|enum|const|let|var)\s+)?(\w+)/,
  );
  const id = prop?.[1] ?? decl?.[1];
  if (!id) return false;

  const idWords = id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const restate = [
    /^(a |an |the )?(unique )?identifier( for .+)?\.?$/i,
    /^(human[- ]readable )?(description|message|label|name)( for .+)?\.?$/i,
    /^whether(\s+\w+){1,8}\.?$/i,
    /^enable(s|d)?\s+/i,
    /^(optional|required)\s+/i,
    /^(total|number of|count of|list of|array of)\s+/i,
    /^(flag|boolean|string|number|value|callback|handler|function|options?|configuration|config|settings?)\.?$/i,
    /^(id|type|name|path|index|timestamp|duration|message|reason|code|severity|valid|error)\s+(of|for|level|when|to)\b/i,
  ];
  if (restate.some((p) => p.test(b))) return true;

  const lower = b.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  if (idWords.length && idWords.every((w) => lower.includes(w))) {
    const filler = lower
      .split(/\s+/)
      .filter(
        (w) =>
          w &&
          !idWords.includes(w) &&
          ![
            "the",
            "a",
            "an",
            "of",
            "for",
            "to",
            "in",
            "on",
            "with",
            "and",
            "or",
            "is",
            "whether",
            "this",
            "node",
            "item",
          ].includes(w),
      );
    if (filler.length <= 2 && b.split(/\s+/).length <= idWords.length + 5) return true;
  }
  return false;
}

function transform(source) {
  let changed = false;
  const lines = source.split("\n");
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Single-line JSDoc
    const single = line.match(/^(\s*)\/\*\*\s*(.*?)\s*\*\/\s*$/);
    if (single) {
      const indent = single[1];
      const body = single[2];
      if (!KEEP_TAG.test(body)) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j < lines.length && isRestating(body, lines[j])) {
          changed = true;
          continue;
        }
        if (OPENER.test(body) && body.length < 140) {
          const rewritten = rewriteOpenerProse([body]);
          if (rewritten && rewritten !== body) {
            out.push(`${indent}/** ${rewritten} */`);
            changed = true;
            continue;
          }
        }
      }
      out.push(line);
      continue;
    }

    // Multi-line JSDoc block starting here
    if (/^\s*\/\*\*\s*$/.test(line) || /^\s*\/\*\*\s+\S/.test(line)) {
      // Collect full block
      if (line.includes("*/") && !/^\s*\/\*\*\s*$/.test(line)) {
        out.push(line);
        continue;
      }
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const blockLines = [line];
      let k = i + 1;
      while (k < lines.length && !lines[k].includes("*/")) {
        blockLines.push(lines[k]);
        k++;
      }
      if (k < lines.length) blockLines.push(lines[k]);
      const block = blockLines.join("\n");
      const prose = jsdocProse(block);
      const tags = (block.match(/^\s*\*\s*(@\w+.*)$/gm) || []).map((t) =>
        t.replace(/^\s*\*\s*/, ""),
      );
      const hasKeep = KEEP_TAG.test(block);
      const hasExample = /@example\b/.test(block) || /```/.test(block);

      // Never rewrite JSDoc that contains examples or keep-tags beyond simple openers
      if (hasExample) {
        out.push(...blockLines);
        i = k;
        continue;
      }

      // Restating single-sentence block
      if (!hasKeep && prose.length === 1 && prose[0].length < 90) {
        let j = k + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j < lines.length && isRestating(prose[0], lines[j])) {
          changed = true;
          i = k;
          continue;
        }
      }

      // Brochure opener rewrite (file/function headers) — keep useful tags
      if (prose.length >= 1 && OPENER.test(prose[0])) {
        const rewritten = rewriteOpenerProse(prose);
        if (rewritten) {
          const keepTags = tags.filter((t) => KEEP_TAG.test(t));
          out.push(formatJsdoc(rewritten, indent, keepTags));
          changed = true;
          i = k;
          continue;
        }
      }

      // Verbose multi-sentence "what" header without keep tags — compress
      // Cap: only headers under 40 lines to avoid eating code on malformed docs
      if (
        !hasKeep &&
        prose.length >= 3 &&
        prose.join(" ").length > 180 &&
        blockLines.length <= 40
      ) {
        const rewritten = rewriteOpenerProse(prose);
        if (rewritten) {
          out.push(formatJsdoc(rewritten, indent, []));
          changed = true;
          i = k;
          continue;
        }
      }

      out.push(...blockLines);
      i = k;
      continue;
    }

    out.push(line);
  }

  let text = out.join("\n");
  const collapsed = text.replace(/\n{3,}/g, "\n\n");
  if (collapsed !== text) {
    text = collapsed;
    changed = true;
  }
  return { text, changed: changed && text !== source };
}

const targets =
  pathArgs.length > 0
    ? pathArgs.flatMap((p) => {
        const full = path.resolve(ROOT, p);
        return fs.statSync(full).isDirectory() ? walk(full) : [full];
      })
    : ["aria", "src"].flatMap((p) => walk(path.join(ROOT, p)));

let modified = 0;
for (const file of targets) {
  const source = fs.readFileSync(file, "utf8");
  const { text, changed } = transform(source);
  if (!changed) continue;
  modified++;
  if (!DRY) fs.writeFileSync(file, text);
  console.log(" ", path.relative(ROOT, file));
}
console.log(`${DRY ? "[dry-run] " : ""}Modified ${modified} files`);
