import { describe, expect, it } from "vitest";

import { roleForScopes } from "./apikeys.server";
import { isValidEasClientId, sanitizeEasClientId } from "./expo";
import { roleHasPermission } from "./rbac";
import { isSafeExternalUrl } from "./url-safety";

describe("roleForScopes (least privilege & RBAC compatibility)", () => {
  it("maps admin scopes and wildcards to admin", () => {
    expect(roleForScopes(["admin"])).toBe("admin");
    expect(roleForScopes(["*"])).toBe("admin");
    expect(roleForScopes(["release.read", "*"])).toBe("admin");
  });

  it("maps rollout scopes to release_manager to allow setRolloutPercentage", () => {
    // RBAC check verification: developer lacks rollout.update permission required by setRolloutPercentage
    expect(roleHasPermission("developer", "rollout.update")).toBe(false);
    expect(roleHasPermission("release_manager", "rollout.update")).toBe(true);

    // Therefore rollout-only keys must map to release_manager so setRolloutPercentage does not break
    expect(roleForScopes(["rollout.write"])).toBe("release_manager");
    expect(roleForScopes(["rollout.read"])).toBe("release_manager");
    expect(roleForScopes(["rollout.*"])).toBe("release_manager");
  });

  it("maps release.publish to release_manager", () => {
    expect(roleForScopes(["release.publish"])).toBe("release_manager");
  });

  it("maps release and app scopes to developer", () => {
    expect(roleForScopes(["release.read", "release.write"])).toBe("developer");
    expect(roleForScopes(["app.read"])).toBe("developer");
    expect(roleForScopes(["app.write"])).toBe("developer");
  });

  it("maps other scopes or empty scopes to viewer", () => {
    expect(roleForScopes([])).toBe("viewer");
    expect(roleForScopes(["analytics.read"])).toBe("viewer");
    expect(roleForScopes(["audit.read"])).toBe("viewer");
  });
});

describe("isSafeExternalUrl (SSRF prevention for externalBundle.url)", () => {
  it("rejects non-https schemes", () => {
    expect(isSafeExternalUrl("http://example.com/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("ftp://example.com/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("file:///bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("not-a-url")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });

  it("rejects forbidden hostnames (localhost, *.local, *.internal)", () => {
    expect(isSafeExternalUrl("https://localhost/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://localhost:8443/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://localhost./bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://2130706433/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[::ffff:7f00:1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://sub.localhost/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://local/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://app.local/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://internal/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://api.internal/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://service.mycorp.internal/bundle.zip")).toBe(false);
  });

  it("rejects private, loopback, and link-local IPv4 literals", () => {
    // 127/8 (loopback)
    expect(isSafeExternalUrl("https://127.0.0.1/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://127.10.20.30:8080/bundle.zip")).toBe(false);

    // 10/8
    expect(isSafeExternalUrl("https://10.0.0.1/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://10.255.255.255/bundle.zip")).toBe(false);

    // 172.16/12
    expect(isSafeExternalUrl("https://172.16.0.1/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://172.31.255.255/bundle.zip")).toBe(false);

    // 192.168/16
    expect(isSafeExternalUrl("https://192.168.0.1/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://192.168.1.100/bundle.zip")).toBe(false);

    // 169.254/16 (link-local)
    expect(isSafeExternalUrl("https://169.254.169.254/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://169.254.1.1/bundle.zip")).toBe(false);

    // 0.0.0.0
    expect(isSafeExternalUrl("https://0.0.0.0/bundle.zip")).toBe(false);
  });

  it("rejects private, loopback, and link-local IPv6 literals", () => {
    // ::1 loopback
    expect(isSafeExternalUrl("https://[::1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[0:0:0:0:0:0:0:1]/bundle.zip")).toBe(false);

    // :: unspecified
    expect(isSafeExternalUrl("https://[::]/bundle.zip")).toBe(false);

    // fc00::/7 (unique local / private)
    expect(isSafeExternalUrl("https://[fc00::1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[fd00::1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[fd12:3456:789a::1]/bundle.zip")).toBe(false);

    // fe80::/10 (link-local)
    expect(isSafeExternalUrl("https://[fe80::1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[fe80::200:5aee:feaa:20a2]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[fea0::1]/bundle.zip")).toBe(false);

    // IPv4-mapped IPv6 with private IPv4
    expect(isSafeExternalUrl("https://[::ffff:127.0.0.1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[::ffff:192.168.1.1]/bundle.zip")).toBe(false);
    expect(isSafeExternalUrl("https://[::ffff:10.0.0.1]/bundle.zip")).toBe(false);
  });

  it("accepts valid, safe public HTTPS endpoints", () => {
    expect(isSafeExternalUrl("https://storage.googleapis.com/bucket/bundle.zip")).toBe(true);
    expect(isSafeExternalUrl("https://s3.us-east-1.amazonaws.com/bundle.zip")).toBe(true);
    expect(isSafeExternalUrl("https://cdn.fireota.dev/release/app.tar.gz")).toBe(true);
    expect(isSafeExternalUrl("https://1.1.1.1/bundle.zip")).toBe(true);
    expect(isSafeExternalUrl("https://8.8.8.8/bundle.zip")).toBe(true);
    expect(isSafeExternalUrl("https://172.15.255.255/bundle.zip")).toBe(true);
    expect(isSafeExternalUrl("https://172.32.0.1/bundle.zip")).toBe(true);
    expect(isSafeExternalUrl("https://192.169.1.1/bundle.zip")).toBe(true);
  });
});

describe("sanitizeEasClientId (Expo EAS client ID validation)", () => {
  it("accepts valid alphanumeric-and-hyphen IDs up to 64 chars", () => {
    expect(isValidEasClientId("eas-client-12345")).toBe(true);
    expect(sanitizeEasClientId("eas-client-12345")).toBe("eas-client-12345");

    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(isValidEasClientId(uuid)).toBe(true);
    expect(sanitizeEasClientId(uuid)).toBe(uuid);

    const exact64 = "a".repeat(64);
    expect(isValidEasClientId(exact64)).toBe(true);
    expect(sanitizeEasClientId(exact64)).toBe(exact64);
  });

  it("rejects IDs exceeding 64 chars", () => {
    const tooLong = "a".repeat(65);
    expect(isValidEasClientId(tooLong)).toBe(false);
    expect(sanitizeEasClientId(tooLong)).toBeNull();
  });

  it("rejects IDs containing invalid characters", () => {
    expect(isValidEasClientId("client_id_with_underscore")).toBe(false);
    expect(sanitizeEasClientId("client_id_with_underscore")).toBeNull();

    expect(isValidEasClientId("client.id.dot")).toBe(false);
    expect(sanitizeEasClientId("client.id.dot")).toBeNull();

    expect(isValidEasClientId("client id space")).toBe(false);
    expect(sanitizeEasClientId("client id space")).toBeNull();

    expect(isValidEasClientId("id;DROP TABLE")).toBe(false);
    expect(sanitizeEasClientId("id;DROP TABLE")).toBeNull();
  });

  it("treats null, undefined, and empty string as missing (returns null)", () => {
    expect(isValidEasClientId("")).toBe(false);
    expect(sanitizeEasClientId("")).toBeNull();

    expect(isValidEasClientId(null)).toBe(false);
    expect(sanitizeEasClientId(null)).toBeNull();

    expect(isValidEasClientId(undefined)).toBe(false);
    expect(sanitizeEasClientId(undefined)).toBeNull();
  });
});
