/**
 * Flutter support in the CLI: pubspec runtime versions, base fingerprints read from APK/AAB
 * archives, the checks that keep a code patch on the store build it was compiled for, and the
 * source patches `fireota init` applies to a Flutter project.
 */
import { deflateRawSync } from "node:zlib";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  baseRecordPath,
  flutterRuntime,
  isFlutterProject,
  libappByAbi,
  patchCompatibilityProblems,
  patchFlutterActivity,
  patchFlutterMain,
  pluginsHash,
  readBaseRecord,
  readPubspec,
  readZipEntries,
  writeBaseRecord,
  // @ts-expect-error -- plain ESM module without type declarations
} from "../../packages/cli/lib/flutter.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { storeVersion } from "../../packages/cli/lib/project.mjs";

const dirs: string[] = [];
function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "fireota-flutter-"));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A minimal ZIP writer (stored and deflated entries), enough to stand in for an APK or AAB. */
function zip(entries: Record<string, Buffer>, deflate = false) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = deflate ? deflateRawSync(content) : content;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe("Flutter project detection and runtime version", () => {
  const pubspec = "name: my_app\nversion: 1.4.0+12\n\ndependencies:\n  flutter:\n    sdk: flutter\n  fireota: ^0.1.0\n\nflutter:\n  uses-material-design: true\n";

  it("reads the runtime as <version>+<build>, matching the SDK", () => {
    const dir = project({ "pubspec.yaml": pubspec });
    expect(isFlutterProject(dir)).toBe(true);
    expect(readPubspec(dir)).toMatchObject({ name: "my_app", version: "1.4.0", build: "12", hasFireOTA: true });
    expect(flutterRuntime(dir)).toBe("1.4.0+12");
  });

  it("uses the pubspec version for both platforms, ahead of android/ and ios/ files", () => {
    const dir = project({ "pubspec.yaml": pubspec, "android/app/build.gradle": 'versionName "9.9.9"' });
    expect(storeVersion("android", dir)).toBe("1.4.0+12");
    expect(storeVersion("ios", dir)).toBe("1.4.0+12");
  });

  it("is not a Flutter project without a flutter section, and keeps React Native behaviour", () => {
    const dir = project({ "pubspec.yaml": "name: pure_dart\nversion: 1.0.0\n", "android/app/build.gradle": 'versionName "2.1.0"' });
    expect(isFlutterProject(dir)).toBe(false);
    expect(storeVersion("android", dir)).toBe("2.1.0");
  });
});

describe("base fingerprints from build archives", () => {
  it("reads libapp.so per ABI from an APK, stored or deflated", () => {
    const arm = Buffer.from("arm64 code");
    const x86 = Buffer.from("x86 code");
    for (const deflate of [false, true]) {
      const dir = project({});
      const apk = join(dir, "app.apk");
      writeFileSync(apk, zip({ "lib/arm64-v8a/libapp.so": arm, "lib/x86_64/libapp.so": x86, "lib/arm64-v8a/libflutter.so": Buffer.from("engine") }, deflate));
      const libs = libappByAbi(apk);
      expect(Object.keys(libs).sort()).toEqual(["arm64-v8a", "x86_64"]);
      expect(libs["arm64-v8a"].equals(arm)).toBe(true);
    }
  });

  it("reads libapp.so from an app bundle's base module", () => {
    const dir = project({});
    const aab = join(dir, "app.aab");
    writeFileSync(aab, zip({ "base/lib/arm64-v8a/libapp.so": Buffer.from("code"), "base/manifest/AndroidManifest.xml": Buffer.from("x") }));
    expect(Object.keys(libappByAbi(aab))).toEqual(["arm64-v8a"]);
  });

  it("rejects a file that is not a ZIP", () => {
    const dir = project({ "broken.apk": "not a zip" });
    expect(() => readZipEntries(join(dir, "broken.apk"), () => true)).toThrow(/not a ZIP/);
  });

  it("stores the base record per runtime version", () => {
    const dir = project({});
    const record = { runtimeVersion: "1.4.0+12", flutterVersion: "3.47.9", base: { "arm64-v8a": "a".repeat(64) } };
    const file = writeBaseRecord(record, dir);
    expect(file).toBe(baseRecordPath("1.4.0+12", dir));
    expect(readBaseRecord("1.4.0+12", dir)).toEqual(record);
    expect(readBaseRecord("1.4.0+13", dir)).toBeNull();
  });
});

describe("patch compatibility", () => {
  const base = { flutterVersion: "3.47.9", engineRevision: "e1", pluginsHash: "p1" };

  it("accepts a patch built with the same toolchain and native plugins", () => {
    expect(patchCompatibilityProblems(base, { ...base })).toEqual([]);
  });

  it("refuses another Flutter version, engine or native plugin set", () => {
    const problems = patchCompatibilityProblems(base, { flutterVersion: "3.48.0", engineRevision: "e2", pluginsHash: "p2" });
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toMatch(/Flutter 3\.48\.0 differs/);
    expect(problems.join(" ")).toMatch(/store release/);
  });

  it("hashes only plugins with native code, by name and version", () => {
    const deps = (plugins: unknown[]) => JSON.stringify({ plugins: { android: plugins } });
    const a = project({ ".flutter-plugins-dependencies": deps([{ name: "camera", path: "/pub/camera-0.10.0/", native_build: true }]) });
    const b = project({ ".flutter-plugins-dependencies": deps([{ name: "camera", path: "/pub/camera-0.11.0/", native_build: true }]) });
    const c = project({
      ".flutter-plugins-dependencies": deps([
        { name: "camera", path: "/pub/camera-0.10.0/", native_build: true },
        { name: "dart_only", path: "/pub/dart_only-1.0.0/", native_build: false },
      ]),
    });
    expect(pluginsHash(a)).not.toBe(pluginsHash(b));
    expect(pluginsHash(a)).toBe(pluginsHash(c));
  });
});

describe("fireota init for Flutter", () => {
  it("starts FireOTA before runApp and makes main async", () => {
    const source = "import 'package:flutter/material.dart';\n\nvoid main() {\n  runApp(const MyApp());\n}\n";
    const patched = patchFlutterMain(source);
    expect(patched).toContain("import 'package:fireota/fireota.dart';\nimport 'fireota_config.dart';\n\nFuture<void> main()");
    expect(patched).toContain("Future<void> main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n  await FireOTA.init(fireotaConfig);\n  runApp(const MyApp());");
    expect(patched).not.toContain("void main() {");
    expect(patchFlutterMain(patched)).toBe(patched);
  });

  it("handles an async main and a file without a Flutter import", () => {
    const patched = patchFlutterMain("Future<void> main() async {\n  runApp(App());\n}\n");
    expect(patched).toContain("import 'package:flutter/widgets.dart';");
    expect(patched?.match(/main\(\)/g)).toHaveLength(1);
  });

  it("gives up rather than guessing when there is no main()", () => {
    expect(patchFlutterMain("void start() {}\n")).toBeNull();
  });

  it("switches MainActivity to FireOTAFlutterActivity in Kotlin and Java", () => {
    const kotlin = "package com.example.app\n\nimport io.flutter.embedding.android.FlutterActivity\n\nclass MainActivity : FlutterActivity()\n";
    expect(patchFlutterActivity(kotlin, true)).toBe(
      "package com.example.app\n\nimport dev.fireota.flutter.FireOTAFlutterActivity\n\nclass MainActivity : FireOTAFlutterActivity()\n",
    );
    const java = "package com.example.app;\n\nimport io.flutter.embedding.android.FlutterActivity;\n\npublic class MainActivity extends FlutterActivity {\n}\n";
    expect(patchFlutterActivity(java, false)).toContain("public class MainActivity extends FireOTAFlutterActivity {");
    expect(patchFlutterActivity(java, false)).toContain("import dev.fireota.flutter.FireOTAFlutterActivity;");
  });

  it("keeps Windows line endings, as `flutter create` writes them on Windows", () => {
    const main = "import 'package:flutter/material.dart';\r\n\r\nvoid main() {\r\n  runApp(const MyApp());\r\n}\r\n";
    const patchedMain = patchFlutterMain(main) ?? "";
    expect(patchedMain).toBe(
      "import 'package:flutter/material.dart';\r\nimport 'package:fireota/fireota.dart';\r\nimport 'fireota_config.dart';\r\n\r\n" +
        "Future<void> main() async {\r\n  WidgetsFlutterBinding.ensureInitialized();\r\n  await FireOTA.init(fireotaConfig);\r\n  runApp(const MyApp());\r\n}\r\n",
    );
    const activity = "package a\r\n\r\nimport io.flutter.embedding.android.FlutterActivity\r\n\r\nclass MainActivity : FlutterActivity()\r\n";
    expect(patchFlutterActivity(activity, true)).toBe(
      "package a\r\n\r\nimport dev.fireota.flutter.FireOTAFlutterActivity\r\n\r\nclass MainActivity : FireOTAFlutterActivity()\r\n",
    );
  });

  it("leaves a customised activity for a manual change", () => {
    expect(patchFlutterActivity("class MainActivity : FlutterFragmentActivity()\n", true)).toBeNull();
  });
});
