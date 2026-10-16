import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, generateApiKey, hashApiKey, pkcePair, sha256Hex, signPayload } from "./crypto.server";
import { ApiError, jsonError } from "./errors";
import { buildManifest, storagePrefix, validateManifest } from "./manifest";
import { ROLE_PERMISSIONS, roleHasPermission, type OrgRole, type Permission } from "./rbac";
import { assertTransition, canTransition, isServable, type ReleaseState } from "./release-state";
import {
  compareVersions,
  inRollout,
  isValidVersion,
  rolloutBucket,
  runtimeCompatible,
  satisfiesConstraint,
  stableHash,
} from "./versions";
import { backoffMs, webhookEndpointProblem } from "./webhooks.server";

describe("version comparison", () => {
  it("orders versions numerically, not lexically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.4.0", "1.4.0")).toBe(0);
    expect(compareVersions("v2.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.4.0-beta.1", "1.4.0")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1);
  });

  it("validates version strings", () => {
    expect(isValidVersion("1.4.2")).toBe(true);
    expect(isValidVersion("1.4")).toBe(true);
    expect(isValidVersion("1.4.2-rc.1")).toBe(true);
    expect(isValidVersion("latest")).toBe(false);
    expect(isValidVersion("1")).toBe(false);
    expect(isValidVersion("1.4.2; drop table")).toBe(false);
  });
});

describe("runtime compatibility", () => {
  it("requires the exact runtime version", () => {
    expect(runtimeCompatible("1.4.0", "1.4.0")).toBe(true);
    expect(runtimeCompatible("1.4.1", "1.4.0")).toBe(false);
    expect(runtimeCompatible("1.5.0", "1.4.0")).toBe(false);
  });
});

describe("native compatibility constraints", () => {
  const cases: [string, string, boolean][] = [
    ["1.4.2", "*", true],
    ["1.4.2", "", true],
    ["1.4.2", "1.4.2", true],
    ["1.4.3", "1.4.2", false],
    ["1.4.2", ">=1.4.0", true],
    ["1.3.9", ">=1.4.0", false],
    ["1.4.0", ">1.4.0", false],
    ["1.3.0", "<1.4.0", true],
    ["1.4.0", "<=1.4.0", true],
    ["1.9.0", "^1.4.0", true],
    ["2.0.0", "^1.4.0", false],
    ["1.3.0", "^1.4.0", false],
    ["1.4.9", "~1.4.0", true],
    ["1.5.0", "~1.4.0", false],
    ["1.4.7", "1.4.x", true],
    ["1.5.0", "1.4.x", false],
    ["1.5.0", "1.4.0 - 1.6.0", true],
    ["1.7.0", "1.4.0 - 1.6.0", false],
    ["1.5.0", ">=1.4.0 <2.0.0", true],
    ["2.1.0", ">=1.4.0 <2.0.0", false],
  ];
  it.each(cases)("%s satisfies %s -> %s", (version, constraint, expected) => {
    expect(satisfiesConstraint(version, constraint)).toBe(expected);
  });
});

describe("deterministic rollout", () => {
  it("uses a stable FNV-1a hash", () => {
    // Reference values: the SDK and every server instance must agree on these.
    expect(stableHash("")).toBe(0x811c9dc5);
    expect(stableHash("a")).toBe(0xe40c292c);
    expect(stableHash("foobar")).toBe(0xbf9cf968);
  });

  it("assigns the same installation the same bucket every time", () => {
    const first = rolloutBucket("install-123", "release-abc");
    for (let i = 0; i < 100; i += 1) expect(rolloutBucket("install-123", "release-abc")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
  });

  it("honours 0% and 100% exactly", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(inRollout(`device-${i}`, "r1", 0)).toBe(false);
      expect(inRollout(`device-${i}`, "r1", 100)).toBe(true);
    }
  });

  it.each([1, 5, 10, 25, 50, 75])("selects roughly %i%% of a large population", (pct) => {
    const n = 20_000;
    let hits = 0;
    for (let i = 0; i < n; i += 1) if (inRollout(`installation-${i}`, "release-xyz", pct)) hits += 1;
    expect(Math.abs((hits / n) * 100 - pct)).toBeLessThan(2);
  });

  it("is monotonic: raising the percentage never removes a device", () => {
    for (let i = 0; i < 2000; i += 1) {
      const id = `mono-${i}`;
      if (inRollout(id, "r9", 10)) expect(inRollout(id, "r9", 50)).toBe(true);
    }
  });
});

describe("release state machine", () => {
  const allowed: [ReleaseState, ReleaseState][] = [
    ["draft", "uploading"],
    ["uploading", "processing"],
    ["processing", "ready"],
    ["processing", "failed"],
    ["ready", "published"],
    ["published", "paused"],
    ["paused", "published"],
    ["published", "rolled_back"],
    ["ready", "archived"],
    ["paused", "archived"],
    ["archived", "deleted"],
  ];
  it.each(allowed)("allows %s -> %s", (from, to) => expect(canTransition(from, to)).toBe(true));

  const rejected: [ReleaseState, ReleaseState][] = [
    ["draft", "published"],
    ["uploading", "published"],
    ["failed", "published"],
    ["published", "deleted"],
    ["paused", "deleted"],
    ["deleted", "published"],
    ["archived", "published"],
    ["processing", "published"],
  ];
  it.each(rejected)("rejects %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow();
  });

  it("only serves published releases", () => {
    const states: ReleaseState[] = ["draft", "uploading", "processing", "ready", "paused", "rolled_back", "archived", "failed", "deleted"];
    for (const s of states) expect(isServable(s)).toBe(false);
    expect(isServable("published")).toBe(true);
  });
});

describe("permission matrix", () => {
  const matrix: Record<OrgRole, { can: Permission[]; cannot: Permission[] }> = {
    owner: { can: ["project.disconnect", "org.delete", "release.delete", "team.manage"], cannot: [] },
    admin: {
      can: ["app.create", "release.delete", "api_key.create", "api_key.read", "webhook.create", "team.manage", "project.connect", "project.disconnect", "project.delete", "org.update", "security.manage"],
      cannot: ["org.delete"],
    },
    release_manager: {
      can: ["release.publish", "release.pause", "release.rollback", "release.archive", "rollout.update", "channel.create", "audit.read"],
      cannot: ["release.delete", "app.create", "app.delete", "team.manage", "api_key.create", "channel.delete", "project.connect"],
    },
    developer: {
      can: ["release.create", "release.upload", "release.read"],
      cannot: ["release.publish", "release.rollback", "release.delete", "rollout.update", "audit.read", "api_key.create", "api_key.read"],
    },
    viewer: {
      can: ["release.read", "app.read", "analytics.read"],
      cannot: ["release.create", "release.publish", "release.upload", "audit.read", "api_key.read", "webhook.read"],
    },
    agent: {
      can: ["release.read", "agent.execute"],
      cannot: ["release.publish", "release.rollback", "release.delete", "team.manage", "agent.manage"],
    },
  };

  for (const [role, { can, cannot }] of Object.entries(matrix) as [OrgRole, (typeof matrix)[OrgRole]][]) {
    it(`${role} has exactly its assigned powers`, () => {
      for (const p of can) expect(roleHasPermission(role, p), `${role} should have ${p}`).toBe(true);
      for (const p of cannot) expect(roleHasPermission(role, p), `${role} must not have ${p}`).toBe(false);
    });
  }

  it("each higher role is a superset of the one below", () => {
    const chain: OrgRole[] = ["viewer", "developer", "release_manager", "admin", "owner"];
    for (let i = 1; i < chain.length; i += 1) {
      const lower = ROLE_PERMISSIONS[chain[i - 1]!];
      const higher = new Set(ROLE_PERMISSIONS[chain[i]!]);
      for (const p of lower) expect(higher.has(p), `${chain[i]} lacks ${p}`).toBe(true);
    }
  });
});

describe("manifest", () => {
  const base = {
    releaseId: "r1",
    appId: "a1",
    platform: "android" as const,
    channel: "production",
    version: "1.4.3",
    runtimeVersion: "1.4.0",
    nativeVersionConstraint: "*",
    bundleUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media",
    bundleHash: "a".repeat(64),
    bundleSize: 1234,
    mandatory: false,
    rolloutPercentage: 10,
  };

  it("builds a valid, versioned manifest", () => {
    const m = buildManifest(base);
    expect(m.manifestVersion).toBe(1);
    expect(validateManifest(m)).toBe(true);
  });

  it("rejects malformed manifests", () => {
    expect(validateManifest(null)).toBe(false);
    expect(validateManifest({ ...buildManifest(base), bundle: { url: "", hash: "short", size: 1 } })).toBe(false);
    expect(validateManifest({ ...buildManifest(base), platform: "web" })).toBe(false);
    expect(validateManifest({ ...buildManifest(base), bundle: { url: "", hash: "a".repeat(64), size: 0 } })).toBe(false);
  });

  it("never lets input contribute path traversal to storage paths", () => {
    const p = storagePrefix({ appId: "../../etc", platform: "android/../ios", channelId: "c h", releaseId: "r%2F1" });
    expect(p).not.toContain("..");
    expect(p).toBe("fireota/apps/etc/androidios/ch/releases/r2F1");
  });
});

describe("crypto", () => {
  it("computes SHA-256", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("round-trips secrets with authenticated encryption and detects tampering", () => {
    process.env["FIREOTA_ENCRYPTION_KEY"] ??= "unit-test-key";
    const sealed = encryptSecret("refresh-token-value");
    expect(sealed).not.toContain("refresh-token-value");
    expect(decryptSecret(sealed)).toBe("refresh-token-value");
    const bytes = Buffer.from(sealed, "base64");
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    expect(() => decryptSecret(bytes.toString("base64"))).toThrow();
  });

  it("stores only a hash of API keys", () => {
    const key = generateApiKey("production");
    expect(key.token.startsWith("fota_sk_live_")).toBe(true);
    expect(key.hash).toBe(hashApiKey(key.token));
    expect(key.hash).not.toContain(key.token);
    expect(key.prefix.length).toBeLessThan(key.token.length);
    expect(generateApiKey("staging").token.startsWith("fota_sk_test_")).toBe(true);
  });

  it("signs webhook payloads with HMAC-SHA256", () => {
    expect(signPayload("secret", "1700000000.{}")).toBe(signPayload("secret", "1700000000.{}"));
    expect(signPayload("secret", "1700000000.{}")).not.toBe(signPayload("secret", "1700000001.{}"));
    expect(signPayload("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("creates PKCE pairs whose challenge is the S256 of the verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(Buffer.from(sha256Hex(verifier), "hex").toString("base64url"));
  });
});

describe("webhook safety", () => {
  it.each([
    "http://example.com/hook",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://172.16.0.1/hook",
    "https://172.31.255.1/hook",
    "https://192.168.1.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/hook",
    "https://[::1]/hook",
    "https://[fd00::1]/hook",
    "https://2130706433/hook",
    "https://0x7f000001/hook",
    "https://metadata.internal/hook",
    "https://user:pass@example.com/hook",
    "https://intranet/hook",
    "not a url",
  ])("rejects %s", (url) => {
    expect(webhookEndpointProblem(url)).not.toBeNull();
  });

  it.each(["https://hooks.example.com/fireota", "https://172.32.0.1/ok", "https://api.github.com/x"])("accepts %s", (url) => {
    expect(webhookEndpointProblem(url)).toBeNull();
  });

  it("backs off exponentially with a cap", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(5)).toBe(960_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe("error envelope", () => {
  it("maps API errors to status codes without leaking internals", async () => {
    const res = jsonError(new ApiError("AUTHORIZATION_ERROR", "nope"), "req-1");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: { code: "AUTHORIZATION_ERROR", message: "nope" } });
  });

  it("hides unexpected errors", async () => {
    const res = jsonError(new Error("duplicate key value violates constraint secret_table_pkey"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("An unexpected error occurred.");
  });

  it("treats malformed JSON as a 400", () => {
    let caught: unknown;
    try {
      JSON.parse("{bad");
    } catch (e) {
      caught = e;
    }
    expect(jsonError(caught).status).toBe(400);
  });
});

describe("update package detection", () => {
  it("accepts FireOTA packages and rejects other uploads", async () => {
    const { gzipSync } = await import("node:zlib");
    const { isFireOtaPackage } = await import("./manifest");
    const pkg = gzipSync(Buffer.concat([Buffer.from("FOTA1\n"), Buffer.alloc(4), Buffer.from("x".repeat(100))]));
    expect(await isFireOtaPackage(new Uint8Array(pkg))).toBe(true);
    expect(await isFireOtaPackage(new Uint8Array(gzipSync(Buffer.from("var a=1;".repeat(20)))))).toBe(false);
    expect(await isFireOtaPackage(new Uint8Array(Buffer.from("plain javascript bundle source code")))).toBe(false);
    expect(await isFireOtaPackage(new Uint8Array(0))).toBe(false);
  });
});
