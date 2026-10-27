import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { base64UrlSha256, expoContentType, expoManifest, expoMultipart } from "./expo";

describe("Expo Updates protocol", () => {
  it("hashes assets as base64url SHA-256", () => {
    const bytes = new TextEncoder().encode("hello");
    const expected = createHash("sha256").update(bytes).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(base64UrlSha256(bytes)).toBe(expected);
  });

  it("maps asset extensions to content types", () => {
    expect(expoContentType("png")).toBe("image/png");
    expect(expoContentType(".TTF")).toBe("font/ttf");
    expect(expoContentType("xyz")).toBe("application/octet-stream");
  });

  it("builds a manifest with the release id as the update id", () => {
    const manifest = expoManifest({
      releaseId: "3f2c8a8e-1b7a-4f3e-9d2a-2b0c1d5e6f70",
      createdAt: "2026-10-27T10:00:00Z",
      runtimeVersion: "1.0.0",
      template: {
        launchAsset: { hash: "h", key: "bundle-1", contentType: "application/javascript", fileExtension: ".bundle", url: "https://x/b" },
        assets: [],
        expoClient: { name: "Demo" },
      },
    });
    expect(manifest.id).toBe("3f2c8a8e-1b7a-4f3e-9d2a-2b0c1d5e6f70");
    expect(manifest.createdAt).toBe("2026-10-27T10:00:00.000Z");
    expect(manifest.extra).toMatchObject({ expoClient: { name: "Demo" } });
  });

  it("encodes a multipart/mixed response with CRLF part boundaries", () => {
    const { body, contentType } = expoMultipart({ name: "directive", json: { type: "noUpdateAvailable" } }, "b0und");
    expect(contentType).toBe("multipart/mixed; boundary=b0und");
    expect(body.startsWith('--b0und\r\ncontent-disposition: form-data; name="directive"\r\n')).toBe(true);
    expect(body).toContain('\r\n\r\n{"type":"noUpdateAvailable"}\r\n--b0und\r\n');
    expect(body.endsWith("--b0und--\r\n")).toBe(true);
  });
});
