export type SpeechDictationEngine = "chromium" | "webkit";

export type SpeechDictationUnsupportedReason =
  | "insecure_context"
  | "unsupported_browser"
  | "blocked_browser";

export interface SpeechDictationSupport {
  supported: boolean;
  engine?: SpeechDictationEngine;
  reason?: SpeechDictationUnsupportedReason;
  blockedBrowser?: string;
}

type SpeechRecognitionConstructor = new () => unknown;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function detectBlockedSpeechBrowser(): string | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const userAgent = navigator.userAgent;

  if (/Edg\//.test(userAgent)) {
    return "Microsoft Edge";
  }

  if (/Brave/.test(userAgent)) {
    return "Brave";
  }

  if ("brave" in navigator) {
    return "Brave";
  }

  if (/OPR\//.test(userAgent)) {
    return "Opera";
  }

  return null;
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function getSpeechDictationEngine(): SpeechDictationEngine | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.SpeechRecognition) {
    return "chromium";
  }

  if (window.webkitSpeechRecognition) {
    return "webkit";
  }

  return null;
}

export function getSpeechDictationSupport(): SpeechDictationSupport {
  if (typeof window === "undefined") {
    return {
      supported: false,
      reason: "unsupported_browser",
    };
  }

  if (!window.isSecureContext) {
    return {
      supported: false,
      reason: "insecure_context",
    };
  }

  const blockedBrowser = detectBlockedSpeechBrowser();
  if (blockedBrowser) {
    return {
      supported: false,
      reason: "blocked_browser",
      blockedBrowser,
    };
  }

  const engine = getSpeechDictationEngine();
  if (!engine) {
    return {
      supported: false,
      reason: "unsupported_browser",
    };
  }

  return {
    supported: true,
    engine,
  };
}

export function isSpeechDictationSupported(): boolean {
  return getSpeechDictationSupport().supported;
}

export function resolveSpeechDictationUnsupportedMessage(
  reason: SpeechDictationUnsupportedReason,
  blockedBrowser?: string,
): string {
  switch (reason) {
    case "insecure_context":
      return "Voice input requires HTTPS.";
    case "blocked_browser":
      return `Voice input doesn't work in ${blockedBrowser ?? "this browser"}. Use Google Chrome or Safari.`;
    case "unsupported_browser":
      return "Voice input works in Chrome and Safari. Firefox doesn't support speech recognition yet.";
  }
}

export function usesWebkitSpeechEngine(): boolean {
  return getSpeechDictationEngine() === "webkit";
}

export const SPEECH_NETWORK_MAX_RETRIES = 4;

export function isRecoverableSpeechRecognitionError(error: string): boolean {
  return error === "no-speech" || error === "aborted" || error === "network";
}

export function resolveSpeechRecognitionError(
  error: string,
  options?: { networkRetriesExhausted?: boolean },
): string | null {
  if (error === "no-speech" || error === "aborted") {
    return null;
  }

  if (error === "network" && !options?.networkRetriesExhausted) {
    return null;
  }

  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied.";
    case "audio-capture":
      return "No microphone was found.";
    case "network": {
      const blockedBrowser = detectBlockedSpeechBrowser();
      if (blockedBrowser) {
        return `Voice input doesn't work in ${blockedBrowser}. Use Google Chrome or Safari.`;
      }

      return "Speech recognition couldn't connect. Disable ad blockers for this site, or use Google Chrome or Safari.";
    }
    case "language-not-supported":
      return "This browser does not support the selected language for voice input.";
    default:
      return "Voice input failed. Try again or check browser permissions.";
  }
}
