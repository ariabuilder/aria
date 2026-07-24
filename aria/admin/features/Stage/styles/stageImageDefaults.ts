/**
 * Zero-specificity canvas defaults for image nodes in the stage iframe. Per-node
 * styles from the Size panel override these via higher specificity.
 */

export function getStageImageDefaultsCss(): string {
  const contentRootSelector = ":where([data-aria-stage-content-root])";

  return `
    ${contentRootSelector} :where(img[data-aria-type="image"]) {
      max-width: 100%;
      max-height: 100%;
      min-height: 0;
    }

    ${contentRootSelector} :where(img[data-aria-image-empty="true"]) {
      aspect-ratio: 16 / 9;
      width: 100%;
      max-height: 100%;
      min-height: 0;
      background: color-mix(in srgb, hsl(var(--muted-foreground)) 12%, transparent);
      object-fit: none;
    }
  `;
}
