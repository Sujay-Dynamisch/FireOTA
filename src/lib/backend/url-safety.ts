/**
 * URL and identifier safety helpers to prevent SSRF and injection.
 */

function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  const [a, b, c, d] = nums;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return [a, b, c, d];
}

function isPrivateIPv4(a: number, b: number, c: number, d: number): boolean {
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  return false;
}

function parseIPv6Hextets(ip: string): [number, number, number, number, number, number, number, number] | null {
  let s = ip.toLowerCase();
  // Handle IPv4-mapped or IPv4-compatible (e.g. ::ffff:192.168.1.1)
  const v4Match = s.match(/(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    const prefix = v4Match[1];
    const v4Str = v4Match[2];
    if (!prefix || !v4Str) return null;
    const v4Parts = v4Str.split(".").map(Number);
    if (v4Parts.length !== 4 || v4Parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return null;
    }
    const [p0, p1, p2, p3] = v4Parts;
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) return null;
    const high = ((p0 << 8) | p1).toString(16);
    const low = ((p2 << 8) | p3).toString(16);
    s = `${prefix}${high}:${low}`;
  }

  let parts: string[];
  const doubleColon = s.indexOf("::");
  if (doubleColon !== -1) {
    if (s.indexOf("::", doubleColon + 1) !== -1) return null;
    const left = s.slice(0, doubleColon).split(":").filter(Boolean);
    const right = s.slice(doubleColon + 2).split(":").filter(Boolean);
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    parts = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    parts = s.split(":");
  }

  if (parts.length !== 8) return null;
  const nums = parts.map((p) => parseInt(p, 16));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = nums;
  if (
    h0 === undefined ||
    h1 === undefined ||
    h2 === undefined ||
    h3 === undefined ||
    h4 === undefined ||
    h5 === undefined ||
    h6 === undefined ||
    h7 === undefined
  ) {
    return null;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7];
}

function isRejectedHostname(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "local" || lower.endsWith(".local")) return true;
  if (lower === "internal" || lower.endsWith(".internal")) return true;
  return false;
}

/**
 * Validates that a URL uses HTTPS and does not resolve to private,
 * loopback, or link-local network spaces or forbidden hostnames.
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  // "localhost." and "host.local." resolve like their dotless forms.
  let host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) return false;

  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  if (isRejectedHostname(host)) {
    return false;
  }

  const v4 = parseIPv4(host);
  if (v4) {
    return !isPrivateIPv4(v4[0], v4[1], v4[2], v4[3]);
  }

  const v6 = parseIPv6Hextets(host);
  if (v6) {
    const [h0, h1, h2, h3, h4, h5, h6, h7] = v6;
    // ::1 loopback
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 1) return false;
    // :: unspecified
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 0) return false;
    // fc00::/7 (unique local / private)
    if ((h0 & 0xfe00) === 0xfc00) return false;
    // fe80::/10 (link-local)
    if ((h0 & 0xffc0) === 0xfe80) return false;
    // IPv4-mapped IPv6 ::ffff:a.b.c.d
    if (
      h0 === 0 &&
      h1 === 0 &&
      h2 === 0 &&
      h3 === 0 &&
      h4 === 0 &&
      h5 === 0xffff &&
      isPrivateIPv4((h6 >> 8) & 0xff, h6 & 0xff, (h7 >> 8) & 0xff, h7 & 0xff)
    ) {
      return false;
    }
  }

  return true;
}

export function isValidEasClientId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 64 && /^[A-Za-z0-9-]+$/.test(id);
}

export function sanitizeEasClientId(id: string | null | undefined): string | null {
  return isValidEasClientId(id) ? id : null;
}
