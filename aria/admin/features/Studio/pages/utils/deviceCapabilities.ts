/**
 * DeviceCapabilities Browser/device capability detection for the Studio admin UI. rules: - All
 * checks are SSR-safe: `window` / `navigator` are only accessed inside the function.
 */

let _isIOSCache: boolean | null = null;

/**
 * Returns `true` when running on iOS or iPadOS.
 * Detection strategy (two-pronged, neither alone is sufficient): 1.
 */
export function isIOS(): boolean {
  if (_isIOSCache !== null) {
    return _isIOSCache;
  }

  if (typeof window === "undefined" || typeof navigator === "undefined") {
    // SSR / non-browser context — conservatively treat as non-iOS so that
    // server-side rendering does not accidentally suppress iframe content.
    _isIOSCache = false;
    return _isIOSCache;
  }

  const ua = navigator.userAgent;

  // Leg 1: Classic iOS/iPadOS UA (covers iOS ≤ 12 and all iPhone/iPod).
  if (/iPad|iPhone|iPod/.test(ua)) {
    _isIOSCache = true;
    return _isIOSCache;
  }

  // Leg 2: iPadOS 13+ — UA reports as Macintosh but touch points > 1.
  // We match "Macintosh" in the UA rather than the deprecated platform string.
  if (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) {
    _isIOSCache = true;
    return _isIOSCache;
  }

  _isIOSCache = false;
  return _isIOSCache;
}

/**
 * Returns `true` when the current device can safely run the
 * hidden-iframe + html-to-image canvas thumbnail capture pipeline. iOS/iPadOS is.
 */
export function isThumbnailCaptureSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return !isIOS();
}
