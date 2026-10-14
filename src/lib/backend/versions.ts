/**
 * Version comparison, runtime/native compatibility, and deterministic rollout bucketing.
 * Pure functions — unit tested in src/lib/backend/versions.test.ts.
 */

export function parseVersion(input: string): [number, number, number] {
  const clean = input.trim().replace(/^v/, "").split(/[-+]/)[0] ?? "0";
  const parts = clean.split(".").map((p) => Number.parseInt(p, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

export function isValidVersion(input: string): boolean {
  return /^v?\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.-]+)?$/.test(input.trim());
}

/**
 * Native compatibility constraint grammar (kept intentionally small and predictable):
 *   "*"            any native version
 *   "1.4.2"        exact
 *   ">=1.4.0"      minimum (also >, <=, <)
 *   "^1.4.0"       same major, at least this version
 *   "~1.4.0"       same major+minor, at least this version
 *   "1.4.x"        wildcard patch
 *   "a - b"        inclusive range
 * Multiple space separated constraints must all be satisfied.
 */
export function satisfiesConstraint(version: string, constraint: string): boolean {
  const spec = (constraint || "*").trim();
  if (spec === "" || spec === "*") return true;

  if (spec.includes(" - ")) {
    const [low, high] = spec.split(" - ").map((s) => s.trim());
    if (!low || !high) return false;
    return compareVersions(version, low) >= 0 && compareVersions(version, high) <= 0;
  }

  return spec
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => satisfiesSingle(version, token));
}

function satisfiesSingle(version: string, token: string): boolean {
  const match = /^(>=|<=|>|<|\^|~|=)?\s*(.+)$/.exec(token);
  if (!match) return false;
  const op = match[1] ?? "=";
  const target = match[2] ?? "";

  if (target.includes("x") || target.includes("*")) {
    const [tMajor, tMinor] = target.split(".");
    const [major, minor] = parseVersion(version);
    if (tMajor && tMajor !== "x" && tMajor !== "*" && Number.parseInt(tMajor, 10) !== major) return false;
    if (tMinor && tMinor !== "x" && tMinor !== "*" && Number.parseInt(tMinor, 10) !== minor) return false;
    return true;
  }

  const cmp = compareVersions(version, target);
  switch (op) {
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case "^": {
      const [major] = parseVersion(target);
      return cmp >= 0 && parseVersion(version)[0] === major;
    }
    case "~": {
      const [major, minor] = parseVersion(target);
      const v = parseVersion(version);
      return cmp >= 0 && v[0] === major && v[1] === minor;
    }
    default:
      return cmp === 0;
  }
}

/**
 * A JavaScript bundle may only be served to a binary built for the same runtime
 * version. Runtime equality is exact by design: never ship incompatible JS.
 */
export function runtimeCompatible(deviceRuntime: string, releaseRuntime: string): boolean {
  return compareVersions(deviceRuntime, releaseRuntime) === 0;
}

/** FNV-1a, 32 bit. Stable across processes and deployments — no randomness. */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic bucket 0-99 for an installation/release pair. */
export function rolloutBucket(installationId: string, releaseId: string): number {
  return stableHash(`${installationId}:${releaseId}`) % 100;
}

export function inRollout(installationId: string, releaseId: string, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  return rolloutBucket(installationId, releaseId) < percentage;
}
