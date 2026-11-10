import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM module without type declarations
import { packDirectory } from "../../../packages/cli/lib/package.mjs";
import { flutterDescriptor, readPackageFile } from "./manifest";
import { runtimeCompatible } from "./versions";

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Builds a .fota exactly as the CLI does. */
function pack(files: Record<string, string | Buffer>) {
  const dir = mkdtempSync(join(tmpdir(), "fireota-pkg-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return new Uint8Array(packDirectory(dir) as Buffer);
}

const base = { "arm64-v8a": "a".repeat(64) };
const codePatch = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, kind: "flutter-aot", runtimeVersion: "1.2.0+7", buildId: "b1", base, ...overrides });

describe("reading files out of an update package", () => {
  it("finds a file after large earlier entries", async () => {
    const bytes = pack({ "assets/big.bin": Buffer.alloc(300_000, 7), "config.json": '{"a":1}', "fireota.json": codePatch() });
    expect(await readPackageFile(bytes, "config.json")).toBe('{"a":1}');
    expect(JSON.parse((await readPackageFile(bytes, "fireota.json")) ?? "{}")).toMatchObject({ kind: "flutter-aot" });
  });

  it("returns null for a missing file, an oversized file or a non-package", async () => {
    expect(await readPackageFile(pack({ "index.android.bundle": "js" }), "fireota.json")).toBeNull();
    expect(await readPackageFile(pack({ "fireota.json": "x".repeat(100) }), "fireota.json", 10)).toBeNull();
    expect(await readPackageFile(new Uint8Array([1, 2, 3]), "fireota.json")).toBeNull();
  });
});

describe("Flutter update descriptors", () => {
  const release = { runtime_version: "1.2.0+7", platform: "android" };

  it("treats a package without fireota.json as React Native", async () => {
    expect(await flutterDescriptor(pack({ "index.android.bundle": "js" }), release)).toBeNull();
  });

  it("accepts a well-formed code patch for the release's runtime", async () => {
    const descriptor = await flutterDescriptor(pack({ "fireota.json": codePatch(), "lib/arm64-v8a/libapp.so": "elf" }), release);
    expect(descriptor).toMatchObject({ kind: "flutter-aot", buildId: "b1", base });
  });

  it("accepts asset updates on iOS", async () => {
    const assets = JSON.stringify({ version: 1, kind: "flutter-assets", runtimeVersion: "1.2.0+7" });
    expect(await flutterDescriptor(pack({ "fireota.json": assets }), { ...release, platform: "ios" })).toMatchObject({ kind: "flutter-assets" });
  });

  it.each([
    ["another runtime", codePatch({ runtimeVersion: "1.2.0+8" }), "android", /built for runtime 1\.2\.0\+8/],
    ["no base fingerprints", codePatch({ base: {} }), "android", /base fingerprints/],
    ["a malformed fingerprint", codePatch({ base: { "arm64-v8a": "nothex" } }), "android", /base fingerprints/],
    ["no build ID", codePatch({ buildId: "" }), "android", /build ID/],
    ["a code patch for iOS", codePatch(), "ios", /Android only/],
    ["an unknown kind", JSON.stringify({ kind: "something", runtimeVersion: "1.2.0+7" }), "android", /Unknown/],
    ["broken JSON", "{", "android", /not valid JSON/],
  ])("rejects %s", async (_name, json, platform, message) => {
    await expect(flutterDescriptor(pack({ "fireota.json": json }), { ...release, platform })).rejects.toThrow(message);
  });
});

describe("runtime matching with build numbers", () => {
  it("matches a Flutter build number exactly", () => {
    expect(runtimeCompatible("1.2.0+7", "1.2.0+7")).toBe(true);
    expect(runtimeCompatible("1.2.0+7", "1.2.0+8")).toBe(false);
    expect(runtimeCompatible("1.2.0", "1.2.0+7")).toBe(false);
  });

  it("keeps semantic matching for plain versions", () => {
    expect(runtimeCompatible("1.4", "1.4.0")).toBe(true);
    expect(runtimeCompatible("1.4.1", "1.4.0")).toBe(false);
  });
});
