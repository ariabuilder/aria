import { bytesToBase64Url } from "../api/crypto";

const USER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEVICE_CODE_PATTERN =
  /^aria_odc_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/u;
const ACCESS_TOKEN_PATTERN =
  /^aria_oat_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/u;
const REFRESH_TOKEN_PATTERN =
  /^aria_ort_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/u;

function randomUserCodeCharacter(): string {
  const upperBound =
    Math.floor(256 / USER_CODE_ALPHABET.length) * USER_CODE_ALPHABET.length;
  for (;;) {
    const value = crypto.getRandomValues(new Uint8Array(1))[0]!;
    if (value < upperBound)
      return USER_CODE_ALPHABET[value % USER_CODE_ALPHABET.length]!;
  }
}

export function createOAuthDeviceCode(): { code: string; prefix: string } {
  const prefix = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(9)));
  const secret = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { code: `aria_odc_${prefix}.${secret}`, prefix };
}

export function parseOAuthDeviceCode(
  raw: string,
): { code: string; prefix: string } | null {
  const match = DEVICE_CODE_PATTERN.exec(raw);
  return match?.[1] ? { code: raw, prefix: match[1] } : null;
}

export function createOAuthUserCode(): string {
  const raw = Array.from({ length: 8 }, randomUserCodeCharacter).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function createOAuthToken(kind: "access" | "refresh"): {
  token: string;
  prefix: string;
} {
  const prefix = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(9)));
  const secret = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return {
    token: `aria_o${kind === "access" ? "at" : "rt"}_${prefix}.${secret}`,
    prefix,
  };
}

function parseOAuthToken(
  raw: string,
  pattern: RegExp,
): { token: string; prefix: string } | null {
  const match = pattern.exec(raw);
  return match?.[1] ? { token: raw, prefix: match[1] } : null;
}

export const createOAuthAccessToken = () => createOAuthToken("access");
export const createOAuthRefreshToken = () => createOAuthToken("refresh");

export const parseOAuthAccessToken = (raw: string) =>
  parseOAuthToken(raw, ACCESS_TOKEN_PATTERN);
export const parseOAuthRefreshToken = (raw: string) =>
  parseOAuthToken(raw, REFRESH_TOKEN_PATTERN);
