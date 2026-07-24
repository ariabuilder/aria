export interface StudioFaviconHrefs {
  light: string;
  dark: string;
}

export function resolveStudioFaviconHrefs(input: {
  favicon?: string | null;
  defaultLightHref: string;
  defaultDarkHref: string;
}): StudioFaviconHrefs {
  const favicon = input.favicon?.trim();

  if (favicon) {
    return { light: favicon, dark: favicon };
  }

  return {
    light: input.defaultLightHref,
    dark: input.defaultDarkHref,
  };
}

/**
 * Updates the builder favicon links after the site setting changes, without
 * requiring the user to reload the current Studio tab.
 */
export function syncStudioFavicon(favicon?: string | null): void {
  if (typeof document === "undefined") return;

  const resolvedFavicon = favicon?.trim();
  const links = document.querySelectorAll<HTMLLinkElement>(
    "link[data-aria-favicon-default-href]",
  );

  for (const link of links) {
    const fallback = link.dataset.ariaFaviconDefaultHref;
    if (resolvedFavicon) {
      link.setAttribute("href", resolvedFavicon);
    } else if (fallback) {
      link.setAttribute("href", fallback);
    }
  }
}
