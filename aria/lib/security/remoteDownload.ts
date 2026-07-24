const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;

export class RemoteDownloadError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_URL"
      | "PRIVATE_DESTINATION"
      | "TOO_MANY_REDIRECTS"
      | "TOO_LARGE"
      | "HTTP_ERROR",
  ) {
    super(message);
    this.name = "RemoteDownloadError";
  }
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  return octets.every(
    (octet, index) =>
      Number.isInteger(octet) &&
      octet >= 0 &&
      octet <= 255 &&
      String(octet) === parts[index],
  )
    ? octets
    : null;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function parseIpv6(hostname: string): number[] | null {
  let value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!value.includes(":")) return null;

  const ipv4Tail = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const octets = parseIpv4(ipv4Tail);
    if (!octets) return null;
    value =
      value.slice(0, -ipv4Tail.length) +
      `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const groups = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group || "0", 16));

  return groups.length === 8 &&
    groups.every((group) => group >= 0 && group <= 0xffff)
    ? groups
    : null;
}

function isPrivateIpv6(groups: number[]): boolean {
  const allZero = groups.every((group) => group === 0);
  const loopback =
    groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const uniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const linkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const multicast = (groups[0] & 0xff00) === 0xff00;
  const ipv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const mappedPrivate =
    ipv4Mapped &&
    isPrivateIpv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  return (
    allZero ||
    loopback ||
    uniqueLocal ||
    linkLocal ||
    multicast ||
    mappedPrivate
  );
}

export function assertSafeRemoteUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new RemoteDownloadError("Remote URL is invalid", "INVALID_URL");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new RemoteDownloadError(
      "Remote URL must be an HTTP(S) URL without credentials",
      "INVALID_URL",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const localHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa");
  const ipv4 = parseIpv4(hostname);
  const ipv6 = parseIpv6(hostname);

  if (
    localHostname ||
    (ipv4 !== null && isPrivateIpv4(ipv4)) ||
    (ipv6 !== null && isPrivateIpv6(ipv6))
  ) {
    throw new RemoteDownloadError(
      "Remote URL resolves to a local or private destination",
      "PRIVATE_DESTINATION",
    );
  }

  return url;
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RemoteDownloadError(
      `Remote file exceeds the ${maxBytes} byte limit`,
      "TOO_LARGE",
    );
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RemoteDownloadError(
          `Remote file exceeds the ${maxBytes} byte limit`,
          "TOO_LARGE",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function downloadRemoteResource(
  input: string | URL,
  options: {
    maxBytes: number;
    timeoutMs?: number;
    maxRedirects?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{ bytes: Uint8Array; response: Response; finalUrl: URL }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Remote download timed out")),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    let url = assertSafeRemoteUrl(input);
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirectCount >= maxRedirects) {
          throw new RemoteDownloadError(
            "Remote URL exceeded the redirect limit",
            "TOO_MANY_REDIRECTS",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new RemoteDownloadError(
            `Remote server returned HTTP ${response.status} without a redirect location`,
            "HTTP_ERROR",
          );
        }
        await response.body?.cancel();
        url = assertSafeRemoteUrl(new URL(location, url));
        continue;
      }

      if (!response.ok) {
        throw new RemoteDownloadError(
          `Remote server returned HTTP ${response.status}`,
          "HTTP_ERROR",
        );
      }

      const bytes = await readBodyWithLimit(response, options.maxBytes);
      return { bytes, response, finalUrl: url };
    }
  } finally {
    clearTimeout(timeout);
  }
}
