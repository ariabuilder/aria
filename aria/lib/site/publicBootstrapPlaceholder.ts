import type { SiteSettings } from "../storage/adapter";
import outfitFontUrl from "../../admin/assets/fonts/outfit-variable.woff2";

export type PublicBootstrapCtaHref = "/admin/setup" | "/admin";

export type PublicBootstrapState =
  | { ready: true }
  | { ready: false; ctaHref: PublicBootstrapCtaHref };

const SHARED_STYLES = `
  @font-face {
    font-family: "Outfit";
    src: url("${outfitFontUrl}") format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }
  :root {
    color-scheme: light;
    --background: oklch(1 0 0);
    --foreground: oklch(0.2838 0.016 145.14);
    --muted-foreground: oklch(0.45 0.0167 145.14);
    --primary: oklch(0.5437 0.0932 185.21);
    --primary-foreground: oklch(0.985 0 0);
    --border: oklch(0.87 0 0);
  }
  html.dark {
    color-scheme: dark;
    --background: oklch(0.15 0.005 145.36);
    --foreground: oklch(0.92 0.0033 195);
    --muted-foreground: oklch(0.7 0.004 228.8);
    --primary: oklch(0.5437 0.0932 185.21);
    --primary-foreground: oklch(0.92 0.0005 195);
    --border: oklch(0.28 0.004 228.8);
  }
  * { box-sizing: border-box; }
  html, body { min-width: 100%; min-height: 100%; }
  body {
    margin: 0;
    font-family: "Outfit", "Helvetica Neue", Arial, sans-serif;
    background: var(--background);
    color: var(--foreground);
  }
  .auth-shell {
    position: relative;
    display: grid;
    min-height: 100vh;
    overflow: hidden;
    background: var(--background);
  }
  .auth-dot-grid-backdrop {
    pointer-events: none;
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.5;
    background-image: radial-gradient(circle, color-mix(in oklch, var(--foreground) 18%, transparent) 1.15px, transparent 1.15px);
    background-size: 24px 24px;
    -webkit-mask-image: radial-gradient(ellipse at center, black 50%, transparent 75%);
    mask-image: radial-gradient(ellipse at center, black 50%, transparent 75%);
    animation: auth-grid-in 720ms ease-out 80ms both;
  }
  .auth-brand {
    position: relative;
    z-index: 1;
    display: none;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    min-width: 0;
    padding: 3rem;
  }
  .aria-mark { display: block; width: 3rem; height: auto; fill: var(--foreground); }
  .auth-brand-copy { align-self: center; max-width: 28rem; margin: auto 0; }
  .auth-brand-copy h1 {
    margin: 0 0 0.5rem;
    font-size: clamp(2.5rem, 4vw, 3rem);
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.025em;
  }
  .auth-brand-version {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .auth-brand-footer {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .auth-panel {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 1.5rem;
  }
  .auth-card {
    position: relative;
    width: min(100%, 28rem);
    padding: 2.5rem;
    border: 1px dashed var(--border);
    background: var(--background);
    animation: auth-fade-up 560ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
  }
  .auth-mobile-mark { display: block; margin: 0 0 2rem; }
  .auth-mobile-mark .aria-mark { width: 2.5rem; }
  .corner {
    position: absolute;
    width: 14px;
    height: 14px;
    z-index: 1;
    pointer-events: none;
  }
  .corner::before, .corner::after {
    content: "";
    position: absolute;
    background: color-mix(in srgb, var(--foreground) 50%, transparent);
  }
  .corner::before { width: 8px; height: 1px; }
  .corner::after { width: 1px; height: 8px; }
  .corner-tl { top: -1px; left: -1px; }
  .corner-tr { top: -1px; right: -1px; transform: rotate(90deg); }
  .corner-bl { bottom: -1px; left: -1px; transform: rotate(-90deg); }
  .corner-br { right: -1px; bottom: -1px; transform: rotate(180deg); }
  .auth-card h2 {
    margin: 0;
    font-size: 1.875rem;
    font-weight: 400;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }
  .auth-card p.description {
    margin: 0.5rem 0 2rem;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }
  a.cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0 1rem;
    border-radius: 0.375rem;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 0.875rem;
    font-weight: 400;
    text-decoration: none;
    transition: filter 100ms ease;
  }
  a.cta:hover { filter: brightness(1.05); }
  a.cta:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }
  @media (min-width: 1024px) {
    .auth-shell { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .auth-brand { display: flex; }
    .auth-mobile-mark { display: none; }
    .auth-card { padding: 2.5rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .auth-dot-grid-backdrop, .auth-card { animation: none; }
  }
  @keyframes auth-grid-in { from { opacity: 0; } to { opacity: 0.5; } }
  @keyframes auth-fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: none; }
  }
`.trim();

const ARIA_MARK = `<svg class="aria-mark" viewBox="0 0 727 621" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g transform="matrix(3.040039,0,0,3.040039,-1199.199655,-483.005411)"><path d="M414.732,338.7C442.022,309.726 452.417,298.214 500.646,253.658C512.365,242.832 523.508,234.73 513.564,239.686C500.707,246.094 500.657,245.764 487.46,251.41C470,258.88 461.944,263.285 464.958,258.731C469.373,252.058 512.107,173.735 516.155,166.315C518.494,162.028 520.3,156.021 522.635,160.418C530.999,176.165 582.223,266.793 581.907,268.613C581.52,270.842 559.235,275.253 510.245,305.078C453.735,339.482 431.962,362.56 425.5,362.599C396.026,362.777 394.261,363.97 394.484,361.498C394.527,361.022 412.163,341.452 414.732,338.7Z" /></g>
  <g transform="matrix(3.040039,0,0,3.040039,-1199.199655,-483.005411)"><path d="M586.593,339.432C573.418,319.82 558.933,300.218 559.359,298.438C559.65,297.221 582.442,286.66 588.389,284.234C591.726,282.872 591.39,285.149 606.332,311.59C608.533,315.486 633.154,359.057 633.453,360.512C633.903,362.709 632.325,362.608 605.5,362.595C600.629,362.592 601.571,360.517 586.593,339.432Z" /></g>
</svg>`;

const ARIA_BUILDER_VERSION = import.meta.env.PUBLIC_APP_VERSION ?? "0.5.7";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShell(input: {
  title: string;
  heading: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(input.title)}</title>
    <script>(function(){document.documentElement.classList.toggle("dark",window.matchMedia("(prefers-color-scheme: dark)").matches);})();</script>
    <style>${SHARED_STYLES}</style>
  </head>
  <body>
    <div class="auth-shell">
      <div class="auth-dot-grid-backdrop" aria-hidden="true"></div>
      <aside class="auth-brand" aria-label="Aria">
        <div class="auth-brand-mark">${ARIA_MARK}</div>
        <div class="auth-brand-copy">
          <h1>Aria Builder</h1>
          <p class="auth-brand-version">Version ${escapeHtml(ARIA_BUILDER_VERSION)}</p>
        </div>
        <p class="auth-brand-footer">© 2026 Statice Origins Inc. Built for creators.</p>
      </aside>
      <main class="auth-panel">
        <section class="auth-card" aria-labelledby="placeholder-heading">
          <span class="corner corner-tl" aria-hidden="true"></span>
          <span class="corner corner-tr" aria-hidden="true"></span>
          <span class="corner corner-bl" aria-hidden="true"></span>
          <span class="corner corner-br" aria-hidden="true"></span>
          <div class="auth-mobile-mark">${ARIA_MARK}</div>
          <h2 id="placeholder-heading">${escapeHtml(input.heading)}</h2>
          <p class="description">${escapeHtml(input.body)}</p>
          <a class="cta" href="${escapeHtml(input.ctaHref)}">${escapeHtml(input.ctaLabel)}</a>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

/**
 * Public site is "ready" once an admin exists and onboarding has finished.
 * Until then Cloudflare "View deployment" and other public hits should land on
 * an Aria setup placeholder instead of a dead 404.
 */
export function resolvePublicBootstrapState(input: {
  userCount: number;
  onboarding?: SiteSettings["onboarding"] | null;
}): PublicBootstrapState {
  if (input.userCount <= 0) {
    return { ready: false, ctaHref: "/admin/setup" };
  }

  const status = input.onboarding?.status ?? "unstarted";
  if (status !== "complete") {
    return { ready: false, ctaHref: "/admin" };
  }

  return { ready: true };
}

export function renderPublicBootstrapPlaceholderHtml(input: {
  ctaHref: PublicBootstrapCtaHref;
}): string {
  const isSetup = input.ctaHref === "/admin/setup";
  return renderShell({
    title: "Set up your Aria site",
    heading: "Aria Builder isn’t set up yet",
    body: isSetup
      ? "Create your first admin account to start onboarding."
      : "Finish onboarding in Studio to choose a starter and publish this site.",
    ctaHref: input.ctaHref,
    ctaLabel: isSetup ? "Set up your system" : "Continue setup",
  });
}

export function renderPublicNotFoundFallbackHtml(input?: {
  pathname?: string;
}): string {
  const pathname = input?.pathname?.trim();
  const body =
    pathname && pathname !== "/"
      ? `The page at ${pathname} could not be found.`
      : "The page you requested could not be found.";

  return renderShell({
    title: "Page not found",
    heading: "Page not found",
    body,
    ctaHref: "/",
    ctaLabel: "Back home",
  });
}
