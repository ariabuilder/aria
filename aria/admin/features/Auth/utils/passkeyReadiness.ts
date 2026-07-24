import type { PasskeyReadiness } from "../schemas/setupWizard";

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function resolveBrowserPasskeyReadiness(): PasskeyReadiness {
  if (typeof window === "undefined") return "backend_unavailable";
  if (!("PublicKeyCredential" in window)) return "unsupported";
  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) {
    return "insecure_context";
  }
  return "ready";
}
