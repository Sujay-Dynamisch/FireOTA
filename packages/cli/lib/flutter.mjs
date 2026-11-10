/**
 * Flutter support: project detection, store builds ("bases") and code patches.
 *
 * A code patch is the compiled Dart library (libapp.so) of a new build. It only runs on the exact
 * store build it was compiled against, so `fireota flutter release` records that build's
 * fingerprints (SHA-256 of libapp.so per ABI, Flutter/engine version, native plugins) and
 * `fireota flutter patch` refuses to build a patch that would not fit.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

export const ABI_TARGETS = { "arm64-v8a": "android-arm64", "armeabi-v7a": "android-arm", "x86_64": "android-x64" };

export function isFlutterProject(root = ".") {
  const file = join(root, "pubspec.yaml");
  return existsSync(file) && /^\s*flutter\s*:/m.test(readFileSync(file, "utf8"));
}

/** name and version from pubspec.yaml; `version: 1.2.0+7` gives version 1.2.0, build 7. */
export function readPubspec(root = ".") {
  const text = readFileSync(join(root, "pubspec.yaml"), "utf8");
  const name = /^name:\s*["']?([\w-]+)/m.exec(text)?.[1] ?? "";
  const raw = /^version:\s*["']?([^\s"'#]+)/m.exec(text)?.[1] ?? "";
  const [version, build] = raw.split("+");
  return { name, version: version ?? "", build: build ?? "", raw, hasFireOTA: /^\s{2}fireota\s*:/m.test(text) };
}

/** The runtime version the SDK reports by default: `<version>+<build>` of the store build. */
export function flutterRuntime(root = ".") {
  const { version, build } = readPubspec(root);
  if (!version) return undefined;
  return build ? `${version}+${build}` : version;
}

/** Runs the flutter tool. On Windows flutter is a .bat file, which only runs through cmd.exe. */
export function flutter(args, { capture = false } = {}) {
  const options = { stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", maxBuffer: 64 * 1024 * 1024 };
  if (process.platform !== "win32") return execFileSync("flutter", args, options);
  for (const arg of args) {
    if (/["%^&|<>!\r\n]/.test(arg)) throw new Error(`Unsupported character in a flutter argument: ${arg}`);
  }
  const line = ["flutter", ...args].map((arg) => (/[\s,;=]/.test(arg) ? `"${arg}"` : arg)).join(" ");
  return execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { ...options, windowsVerbatimArguments: true });
}

/** Flutter framework and engine versions: a patch must be compiled by the same ones as its base. */
export function flutterVersionInfo() {
  const info = JSON.parse(flutter(["--version", "--machine"], { capture: true }).toString());
  return { flutterVersion: info.frameworkVersion ?? info.flutterVersion, engineRevision: info.engineRevision ?? "" };
}

/**
 * Fingerprint of the plugins with Android/iOS native code. Adding, removing or upgrading one
 * changes native code, which only a store release can ship.
 */
export function pluginsHash(root = ".", platform = "android") {
  const file = join(root, ".flutter-plugins-dependencies");
  if (!existsSync(file)) return "";
  const plugins = JSON.parse(readFileSync(file, "utf8")).plugins?.[platform] ?? [];
  const ids = plugins
    .filter((p) => p.native_build !== false)
    .map((p) => `${p.name}:${basename(String(p.path ?? "").replace(/[\\/]+$/, ""))}`)
    .sort();
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}

export function newBuildId() {
  return `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

/** Reads entries from a ZIP (APK or AAB) whose names match `test`. Stored and deflated entries only. */
export function readZipEntries(file, test) {
  const zip = readFileSync(file);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file} is not a ZIP archive.`);
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff) throw new Error(`${file} is a ZIP64 archive, which is not supported.`);
  const out = new Map();
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${file}: corrupt central directory.`);
    const method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!test(name)) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + compressed);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data));
    else throw new Error(`${file}: ${name} uses unsupported compression ${method}.`);
  }
  return out;
}

/** libapp.so per ABI from an APK (`lib/<abi>/libapp.so`) or AAB (`base/lib/<abi>/libapp.so`). */
export function libappByAbi(archive) {
  const entries = readZipEntries(archive, (name) => /(^|\/)lib\/[^/]+\/libapp\.so$/.test(name));
  const result = {};
  for (const [name, bytes] of entries) result[name.split("/").at(-2)] = bytes;
  return result;
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function baseRecordPath(runtime, root = ".") {
  return join(root, ".fireota", "flutter", `android-${runtime.replace(/[^\w.+-]/g, "_")}.json`);
}

export function readBaseRecord(runtime, root = ".") {
  const file = baseRecordPath(runtime, root);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function writeBaseRecord(record, root = ".") {
  const file = baseRecordPath(record.runtimeVersion, root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

/** Why a patch built now would not fit its base, or an empty list. */
export function patchCompatibilityProblems(base, current) {
  const problems = [];
  if (base.flutterVersion !== current.flutterVersion) {
    problems.push(`Flutter ${current.flutterVersion} differs from the store build's ${base.flutterVersion}.`);
  }
  if (base.engineRevision && current.engineRevision && base.engineRevision !== current.engineRevision) {
    problems.push("The Flutter engine differs from the store build's.");
  }
  if (base.pluginsHash && current.pluginsHash && base.pluginsHash !== current.pluginsHash) {
    problems.push("Plugins with native code were added, removed or upgraded since the store build; ship a store release.");
  }
  return problems;
}

export function buildStore({ buildId, apk = false, extra = [] }) {
  flutter(["build", apk ? "apk" : "appbundle", "--release", `--dart-define=FIREOTA_BUILD_ID=${buildId}`, ...extra]);
  return apk ? join("build", "app", "outputs", "flutter-apk", "app-release.apk") : join("build", "app", "outputs", "bundle", "release", "app-release.aab");
}

export function buildPatchApk({ buildId, abis, extra = [] }) {
  const targets = abis.map((abi) => ABI_TARGETS[abi]).filter(Boolean);
  flutter(["build", "apk", "--release", `--target-platform=${targets.join(",")}`, `--dart-define=FIREOTA_BUILD_ID=${buildId}`, ...extra]);
  return join("build", "app", "outputs", "flutter-apk", "app-release.apk");
}

// ---------- fireota init for Flutter ----------

export function flutterConfigSource({ appId, serverUrl, channel }) {
  return `// Generated by \`fireota init\`. Safe to edit and commit.
import 'package:fireota/fireota.dart';

const fireotaConfig = FireOTAConfig(
  appId: '${appId}',
  serverUrl: '${serverUrl}',
  channel: '${channel}',
  // Dart code patches on Android. Read "Store policy" in the fireota README first.
  allowCodePush: false,
  // Paste fireota-public.pem here (fireota signing generate). Required for code patches.
  codeSigningCertificate: null,
);
`;
}

/** Makes main() async and starts FireOTA before runApp. Returns null when it cannot patch safely. */
export function patchFlutterMain(source, configImport = "fireota_config.dart") {
  if (source.includes("FireOTA.init(")) return source;
  // Keep the file's own line endings: `flutter create` writes CRLF on Windows.
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const main = /^[ \t]*(?:Future<void>\s+|void\s+)?main\s*\(\s*\)\s*(?:async\s*)?\{/m.exec(source);
  if (!main) return null;
  const body = `Future<void> main() async {${eol}  WidgetsFlutterBinding.ensureInitialized();${eol}  await FireOTA.init(fireotaConfig);`;
  let next = source.slice(0, main.index) + body + source.slice(main.index + main[0].length);
  const imports = ["import 'package:fireota/fireota.dart';", `import '${configImport}';`];
  if (!/import\s+['"]package:flutter\/(material|widgets|cupertino)\.dart['"]/.test(next)) imports.unshift("import 'package:flutter/widgets.dart';");
  const lastImport = [...next.matchAll(/^import\s+[^;\r\n]+;[ \t]*(?=\r?$)/gm)].at(-1);
  if (lastImport) {
    const at = lastImport.index + lastImport[0].length;
    next = `${next.slice(0, at)}${eol}${imports.join(eol)}${next.slice(at)}`;
  } else {
    next = `${imports.join(eol)}${eol}${eol}${next}`;
  }
  return next;
}

/** MainActivity extends FireOTAFlutterActivity, which starts the engine with the installed patch. */
export function patchFlutterActivity(source, isKotlin) {
  if (source.includes("FireOTAFlutterActivity")) return source;
  if (isKotlin) {
    if (!/:\s*FlutterActivity\(\)/.test(source)) return null;
    return source
      .replace(/import io\.flutter\.embedding\.android\.FlutterActivity(?=[ \t]*\r?\n)/, "import dev.fireota.flutter.FireOTAFlutterActivity")
      .replace(/:\s*FlutterActivity\(\)/, ": FireOTAFlutterActivity()");
  }
  if (!/extends\s+FlutterActivity\b/.test(source)) return null;
  return source
    .replace(/import io\.flutter\.embedding\.android\.FlutterActivity;/, "import dev.fireota.flutter.FireOTAFlutterActivity;")
    .replace(/extends\s+FlutterActivity\b/, "extends FireOTAFlutterActivity");
}
