/**
 * The CLI's update-package format must round-trip through the same algorithm the native SDK
 * uses (FireOTAStore.kt / FireOTA.m): gzip, "FOTA1\n" magic, u32 header length, JSON header,
 * file bytes, and path validation that keeps every file inside the release directory.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM module without type declarations
import { packDirectory } from "../../packages/cli/lib/package.mjs";

/** JS mirror of the native unpacker, including its safety checks. */
function unpack(archive: Buffer, into: string) {
  const raw = gunzipSync(archive);
  if (raw.subarray(0, 6).toString("ascii") !== "FOTA1\n") throw new Error("Not a FireOTA package.");
  const headerLength = raw.readUInt32BE(6);
  if (headerLength <= 0 || headerLength > 4 * 1024 * 1024) throw new Error("Invalid package header.");
  if (10 + headerLength > raw.length) throw new Error("Truncated update package.");
  const header = JSON.parse(raw.subarray(10, 10 + headerLength).toString("utf8")) as { files: { path: string; size: number }[] };
  let offset = 10 + headerLength;
  const base = resolve(into);
  for (const file of header.files) {
    const out = resolve(base, file.path);
    if (file.path.startsWith("/") || file.path.includes("..") || !out.startsWith(base + sep)) {
      throw new Error(`Unsafe path in update package: ${file.path}`);
    }
    if (offset + file.size > raw.length) throw new Error("Truncated update package.");
    mkdirSync(resolve(out, ".."), { recursive: true });
    writeFileSync(out, raw.subarray(offset, offset + file.size));
    offset += file.size;
  }
  return header.files.map((f) => f.path);
}

function craft(files: { path: string; data: Buffer }[]) {
  const header = Buffer.from(JSON.stringify({ files: files.map((f) => ({ path: f.path, size: f.data.length })) }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return gzipSync(Buffer.concat([Buffer.from("FOTA1\n"), length, header, ...files.map((f) => f.data)]));
}

const work = mkdtempSync(join(tmpdir(), "fota-test-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("FireOTA update package", () => {
  it("round-trips a bundle with Android drawable assets byte for byte", () => {
    const src = join(work, "android-src");
    mkdirSync(join(src, "drawable-mdpi"), { recursive: true });
    mkdirSync(join(src, "raw"), { recursive: true });
    const bundle = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, ...Array.from({ length: 5000 }, (_, i) => i % 256)]);
    writeFileSync(join(src, "index.android.bundle"), bundle);
    writeFileSync(join(src, "drawable-mdpi", "assets_logo.png"), Buffer.from("png-bytes"));
    writeFileSync(join(src, "raw", "empty.json"), Buffer.alloc(0));

    const packed: Buffer = packDirectory(src);
    const out = join(work, "android-out");
    const paths = unpack(packed, out);

    expect(paths.sort()).toEqual(["drawable-mdpi/assets_logo.png", "index.android.bundle", "raw/empty.json"]);
    expect(readFileSync(join(out, "index.android.bundle")).equals(bundle)).toBe(true);
    expect(readFileSync(join(out, "drawable-mdpi", "assets_logo.png")).toString()).toBe("png-bytes");
    expect(readFileSync(join(out, "raw", "empty.json")).length).toBe(0);
  });

  it("keeps iOS asset directories next to main.jsbundle", () => {
    const src = join(work, "ios-src");
    mkdirSync(join(src, "assets", "src", "img"), { recursive: true });
    writeFileSync(join(src, "main.jsbundle"), "js");
    writeFileSync(join(src, "assets", "src", "img", "logo@2x.png"), "img");
    const out = join(work, "ios-out");
    expect(unpack(packDirectory(src), out).sort()).toEqual(["assets/src/img/logo@2x.png", "main.jsbundle"]);
  });

  it("is deterministic for the same input, so checksums are stable", () => {
    const src = join(work, "android-src");
    expect(packDirectory(src).equals(packDirectory(src))).toBe(true);
  });

  it.each(["../escape.js", "/etc/passwd", "a/../../escape.js"])("rejects the unsafe path %s", (path) => {
    expect(() => unpack(craft([{ path, data: Buffer.from("x") }]), join(work, "evil"))).toThrow(/Unsafe path/);
  });

  it("rejects foreign or truncated archives", () => {
    expect(() => unpack(gzipSync(Buffer.from("PK\u0003\u0004 zip file")), join(work, "bad"))).toThrow(/Not a FireOTA package/);
    const truncated = gunzipSync(craft([{ path: "index.android.bundle", data: Buffer.alloc(100) }])).subarray(0, 60);
    expect(() => unpack(gzipSync(truncated), join(work, "bad2"))).toThrow(/Truncated/);
  });
});
