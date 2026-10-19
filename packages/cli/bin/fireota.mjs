#!/usr/bin/env node
/**
 * FireOTA CLI — build update packages and manage releases from a terminal or any CI.
 * Needs Node 18+. Configuration via environment (flags win over environment):
 *   FIREOTA_URL       your FireOTA deployment, e.g. https://ota.example.com
 *   FIREOTA_API_KEY   an API key from Settings -> API keys (fota_sk_...)
 *   FIREOTA_APP_ID, FIREOTA_CHANNEL, FIREOTA_RUNTIME   defaults for --app, --channel, --runtime
 *   FIREOTA_SIGNING_KEY (PEM text) or FIREOTA_SIGNING_KEY_PATH   code signing private key
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { detectCi } from "../lib/ci.mjs";
import { runInit } from "../lib/init.mjs";
import { packDirectory } from "../lib/package.mjs";
import { storeVersion } from "../lib/project.mjs";
import { generateKeys, loadPrivateKey, signUpdate } from "../lib/signing.mjs";

const HELP = `FireOTA CLI

Usage:
  fireota init     [--app <appId>] [--server-url <url>] [--channel production] [--dry-run] [--force]
                   One-time setup: creates fireota.config.js, wraps your root component with the
                   built-in update UI, and wires MainApplication / AppDelegate for release builds.
  fireota publish  --app <appId> --platform <android|ios|all> [--runtime <x.y.z>] --message "What changed"
                   [--channel production] [--rollout 10] [--version <label>] [--mandatory] [--native ">=1.4.0"]
                   [--file update.fota] [--private-key fireota-private.pem] [--json]
                   Builds (unless --file), uploads to your Firebase Storage and publishes.
                   --platform all publishes Android + iOS as one update group.
  fireota bundle   --platform <android|ios> [--entry index.js] [--out update.fota] [--hermes auto|on|off]
  fireota whoami   Shows the workspace, key role and apps behind FIREOTA_API_KEY.
  fireota signing generate [--out ./fireota-keys]   Creates an RSA key pair for code signing.
  fireota release create   --app <appId> --platform <p> --runtime <r> [--message m] [--version v] [--channel c]
  fireota release upload   <releaseId> --file update.fota [--private-key key.pem]
  fireota release publish  <releaseId> [--rollout 100]
  fireota release rollout  <releaseId> --percentage <0-100>
  fireota release pause    <releaseId>
  fireota release rollback <releaseId> --reason "..." [--target <releaseId>]
  fireota releases [--app <appId>] [--json]

Updates are identified by their ID (like Expo): --version is only an optional label, and
--runtime must equal the runtime version of the store build the update is for. Without
--runtime, the app's store version is used (android/app/build.gradle versionName, iOS
MARKETING_VERSION) — the same default the SDK uses.

Environment: FIREOTA_URL, FIREOTA_API_KEY (required); FIREOTA_APP_ID, FIREOTA_CHANNEL,
FIREOTA_RUNTIME, FIREOTA_SIGNING_KEY / FIREOTA_SIGNING_KEY_PATH (optional).
Works on GitHub Actions, GitLab, Bitbucket, Jenkins, Azure DevOps, CircleCI, Bitrise and any
other CI: commit, branch and build number are detected automatically.
Exit codes: 0 success, 1 error.`;

let jsonMode = false;
/** Human progress goes to stderr in --json mode so stdout stays machine-readable. */
const log = (...args) => (jsonMode ? console.error(...args) : console.log(...args));

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

function fail(message) {
  if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
  console.error(`fireota: ${message}`);
  process.exit(1);
}

function need(flags, key, envName) {
  const value = flags[key] ?? (envName ? process.env[envName] : undefined);
  if (value === undefined || value === true || value === "") fail(`--${key} is required${envName ? ` (or set ${envName})` : ""}`);
  return String(value);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Deterministic RFC-4122-shaped id, so a retried CI job reuses the same update group. */
function groupIdFrom(seed) {
  const h = sha256(Buffer.from(seed));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------- packaging ----------

function hermesEnabled(platform, mode) {
  if (mode === "on") return true;
  if (mode === "off") return false;
  if (platform === "android") {
    const props = existsSync("android/gradle.properties") ? readFileSync("android/gradle.properties", "utf8") : "";
    return !/^\s*hermesEnabled\s*=\s*false/m.test(props);
  }
  const podfile = existsSync("ios/Podfile") ? readFileSync("ios/Podfile", "utf8") : "";
  return !/:hermes_enabled\s*=>\s*false/.test(podfile);
}

function hermesc() {
  const dir = { win32: "win64-bin", darwin: "osx-bin", linux: "linux64-bin" }[process.platform];
  const candidates = [
    join("node_modules", "react-native", "sdks", "hermesc", dir ?? "", process.platform === "win32" ? "hermesc.exe" : "hermesc"),
    join("node_modules", "hermes-compiler", "hermesc", dir ?? "", process.platform === "win32" ? "hermesc.exe" : "hermesc"),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) fail("Hermes is enabled but hermesc was not found in node_modules. Run npm install, or pass --hermes off.");
  return found;
}

/** Runs the React Native bundler (+ Hermes) and packs bundle and assets into one update file. */
function bundle(flags, platformOverride) {
  const platform = platformOverride ?? need(flags, "platform");
  if (!["android", "ios"].includes(platform)) fail("--platform must be android or ios");
  if (!existsSync("package.json") || !existsSync(join("node_modules", "react-native"))) {
    fail("Run this from your React Native project root (react-native must be installed).");
  }
  const entry = flags.entry ? String(flags.entry) : existsSync("index.js") ? "index.js" : "index.ts";
  const bundleName = platform === "android" ? "index.android.bundle" : "main.jsbundle";
  const work = mkdtempSync(join(tmpdir(), "fireota-"));
  const out = join(work, "package");
  try {
    const jsOut = join(work, "bundle.js");
    log(`Bundling ${entry} for ${platform}…`);
    // Run the project's own React Native CLI through Node: no shell, same on every OS.
    execFileSync(
      process.execPath,
      [join("node_modules", "react-native", "cli.js"), "bundle", "--platform", platform, "--dev", "false", "--minify", "false", "--entry-file", entry, "--bundle-output", jsOut, "--assets-dest", out],
      { stdio: jsonMode ? ["ignore", "ignore", "inherit"] : "inherit" },
    );
    // The bundler only creates the assets folder when the app has images.
    mkdirSync(out, { recursive: true });
    if (hermesEnabled(platform, String(flags.hermes ?? "auto"))) {
      log("Compiling to Hermes bytecode…");
      execFileSync(hermesc(), ["-O", "-w", "-emit-binary", "-out", join(out, bundleName), jsOut], {
        stdio: jsonMode ? ["ignore", "ignore", "inherit"] : "inherit",
      });
    } else {
      writeFileSync(join(out, bundleName), readFileSync(jsOut));
    }
    const packed = packDirectory(out);
    const target = resolve(String(flags.out && !platformOverride ? flags.out : `fireota-${platform}.fota`));
    writeFileSync(target, packed);
    log(`Package: ${target}\nSize:    ${(packed.length / 1024 / 1024).toFixed(2)} MB\nSHA-256: ${sha256(packed)}`);
    return target;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- API ----------

async function api(method, path, body, extraHeaders = {}) {
  const base = process.env.FIREOTA_URL;
  const key = process.env.FIREOTA_API_KEY;
  if (!base) fail("Set FIREOTA_URL to your FireOTA deployment URL.");
  if (!key) fail("Set FIREOTA_API_KEY (Settings -> API keys).");
  const headers = { authorization: `Bearer ${key}`, "user-agent": "fireota-cli", ...extraHeaders };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${base.replace(/\/+$/, "")}/api/public/v1${path}`, { method, headers, body: payload });
  } catch (error) {
    fail(`Could not reach ${base}: ${error instanceof Error ? error.message : error}`);
  }
  let json;
  try {
    json = await response.json();
  } catch {
    fail(`Unexpected response from FireOTA (HTTP ${response.status}).`);
  }
  if (!json.success) fail(`${json.error?.code ?? "ERROR"}: ${json.error?.message ?? "request failed"}`);
  return json.data;
}

/** --runtime / FIREOTA_RUNTIME, else the app's store version for that platform. */
function runtimeFor(flags, platform) {
  const explicit = flags.runtime ?? process.env.FIREOTA_RUNTIME;
  if (explicit && explicit !== true) return String(explicit);
  const detected = storeVersion(platform);
  if (!detected) fail(`Could not read the ${platform} app version; pass --runtime <x.y.z>.`);
  return detected;
}

async function createRelease(flags, platform, extra = {}) {
  const ci = detectCi();
  const message = flags.message ?? flags.notes;
  const body = {
    appId: need(flags, "app", "FIREOTA_APP_ID"),
    channel: String(flags.channel ?? process.env.FIREOTA_CHANNEL ?? "production"),
    platform,
    runtimeVersion: runtimeFor(flags, platform),
    ...(flags.version && flags.version !== true ? { version: String(flags.version) } : {}),
    ...(message && message !== true ? { releaseNotes: String(message) } : {}),
    ...(flags.mandatory ? { mandatory: true } : {}),
    ...(flags.native ? { nativeVersionConstraint: String(flags.native) } : {}),
    ...(ci.gitCommitSha ? { gitCommitSha: ci.gitCommitSha.slice(0, 64) } : {}),
    ...(ci.gitBranch ? { gitBranch: ci.gitBranch.slice(0, 120) } : {}),
    ...(ci.buildNumber ? { buildNumber: String(ci.buildNumber).slice(0, 40) } : {}),
    ...extra,
  };
  // Same inputs -> same release, so a retried CI job never creates duplicates.
  const idempotencyKey = sha256(Buffer.from(JSON.stringify(body)));
  const release = await api("POST", "/releases", body, { "idempotency-key": idempotencyKey });
  log(`Update #${release.number} (${release.id}) — ${release.status} [${platform}, ${ci.provider}]`);
  return release;
}

async function uploadRelease(releaseId, file, signing) {
  if (!existsSync(file)) fail(`File not found: ${file}`);
  const bytes = readFileSync(file);
  const hash = sha256(bytes);
  const form = new FormData();
  form.append("bundle", new Blob([bytes], { type: "application/octet-stream" }), "update.fota");
  const headers = { "x-bundle-sha256": hash };
  if (signing?.key) {
    headers["x-fireota-signature"] = signUpdate(signing.key, { runtimeVersion: signing.runtimeVersion, platform: signing.platform, sha256: hash });
    log("Signed with your code signing key.");
  }
  log(`Uploading ${(bytes.length / 1024 / 1024).toFixed(2)} MB…`);
  const result = await api("POST", `/releases/${releaseId}/bundle`, form, headers);
  log(`Verified in your Firebase Storage. SHA-256 ${result.checksum}`);
  return result;
}

async function releaseAction(releaseId, body) {
  return api("POST", `/releases/${releaseId}/publish`, body);
}

/** Create → upload → publish, skipping steps a retried CI job already completed. */
async function publishOne(flags, platform, file, extra, privateKey) {
  const release = await createRelease(flags, platform, extra);
  if (["draft", "failed", "uploading"].includes(release.status)) {
    await uploadRelease(release.id, file, privateKey ? { key: privateKey, runtimeVersion: runtimeFor(flags, platform), platform } : null);
  } else {
    log(`Bundle already uploaded (status ${release.status}); skipping upload.`);
  }
  const rollout = Number(flags.rollout ?? 100);
  if (release.status === "published") {
    log("Already published; nothing to do.");
    return { id: release.id, number: release.number, platform, rollout: null, status: "published" };
  }
  const result = await releaseAction(release.id, { action: "publish", rolloutPercentage: rollout });
  log(`Published update #${release.number} (${platform}) at ${result.rollout}%.`);
  return { id: release.id, number: release.number, platform, rollout: result.rollout, status: "published" };
}

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs([sub, ...rest].filter((v) => v !== undefined));
  jsonMode = Boolean(flags.json);

  if (!command || command === "help" || command === "--help" || flags.help) {
    console.log(HELP);
    return;
  }
  if (command === "bundle") {
    bundle(parseArgs(process.argv.slice(3)).flags);
    return;
  }
  if (command === "init") {
    const all = parseArgs(process.argv.slice(3)).flags;
    const result = await runInit(all, { api, log, fail });
    console.log(result.dry ? "\nFireOTA init (dry run — nothing written):\n" : "\nFireOTA is set up:\n");
    for (const [mark, text] of result.results) console.log(`  ${mark} ${text}`);
    const versions = [
      result.runtime.android ? `Android ${result.runtime.android}` : null,
      result.runtime.ios ? `iOS ${result.runtime.ios}` : null,
    ].filter(Boolean);
    console.log(`
Runtime version: ${versions.join(", ") || "unknown"} (your store version — bump it when native code changes).

Next:
  1. Rebuild the app once (release build / store build): npx react-native run-android --mode release${result.runtime.ios ? "\n     iOS: cd ios && pod install" : ""}
  2. Publish an update:  FIREOTA_URL=${result.serverUrl} FIREOTA_API_KEY=… npm run ota:publish -- --message "What changed"
  3. Optional: show <UpdateScreen /> from '@fireota/react-native' in your settings.`);
    if (result.results.some(([mark]) => mark === "!")) console.log("\nSteps marked ! need a manual change — see https://github.com/Sujay-Dynamisch/FireOTA#readme");
    return;
  }
  if (command === "whoami") {
    const me = await api("GET", "/me");
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, ...me }));
      return;
    }
    console.log(`Workspace: ${me.organization.name} (${me.organization.slug})\nKey:       ${me.key.label} — acts as ${me.key.role}\nApps:`);
    for (const app of me.apps) {
      console.log(`  ${app.name}\t${app.id}\truntime ${app.runtimeVersion}${app.requiresSignedUpdates ? "\tsigned updates required" : ""}`);
    }
    return;
  }
  if (command === "signing") {
    if (positional[0] !== "generate") fail("usage: fireota signing generate [--out ./fireota-keys]");
    const keys = generateKeys(flags.out && flags.out !== true ? String(flags.out) : undefined);
    console.log(`Created ${keys.privatePath} (keep secret — never commit it)\nCreated ${keys.publicPath}

Next:
  1. Dashboard → Applications → your app → Code signing: paste ${keys.publicPath}
  2. In the app: FireOTA.configure({ …, codeSigningCertificate: <contents of fireota-public.pem> })
  3. Publish with --private-key ${keys.privatePath}  (in CI: store the file as the FIREOTA_SIGNING_KEY secret)`);
    return;
  }
  if (command === "releases") {
    const app = flags.app ?? process.env.FIREOTA_APP_ID;
    const query = app ? `?appId=${encodeURIComponent(String(app))}` : "";
    const rows = await api("GET", `/releases${query}`);
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, releases: rows }));
      return;
    }
    for (const r of rows) {
      console.log(`#${r.number}\t${r.id.slice(0, 8)}\t${r.platform}\truntime ${r.runtime_version}\t${r.status}\t${r.rollout_percentage}%\t${r.version || "-"}\t${(r.release_notes || "").split("\n")[0]}`);
    }
    return;
  }
  if (command === "publish") {
    const all = parseArgs(process.argv.slice(3)).flags;
    jsonMode = Boolean(all.json);
    const platform = need(all, "platform");
    if (!["android", "ios", "all"].includes(platform)) fail("--platform must be android, ios or all");
    if (platform === "all" && all.file) fail("--file cannot be combined with --platform all (each platform needs its own package).");
    let privateKey = null;
    try {
      privateKey = loadPrivateKey(all["private-key"] && all["private-key"] !== true ? String(all["private-key"]) : undefined);
    } catch (error) {
      fail(`Could not read the signing key: ${error instanceof Error ? error.message : error}`);
    }

    const platforms = platform === "all" ? ["android", "ios"] : [platform];
    const files = Object.fromEntries(platforms.map((p) => [p, all.file ? String(all.file) : bundle(all, p)]));
    // Android + iOS built from the same commit form one update group (Expo-style).
    const extra =
      platform === "all"
        ? { groupId: groupIdFrom(platforms.map((p) => `${sha256(readFileSync(files[p]))}@${runtimeFor(all, p)}`).join(":")) }
        : {};
    const results = [];
    for (const p of platforms) results.push(await publishOne(all, p, files[p], extra, privateKey));
    if (jsonMode) console.log(JSON.stringify({ ok: true, groupId: extra.groupId ?? null, updates: results }));
    return;
  }
  if (command === "release") {
    const id = positional[1];
    switch (positional[0]) {
      case "create": {
        const r = await createRelease(flags, need(flags, "platform"));
        if (jsonMode) console.log(JSON.stringify({ ok: true, ...r }));
        return;
      }
      case "upload": {
        let privateKey = null;
        try {
          privateKey = loadPrivateKey(flags["private-key"] && flags["private-key"] !== true ? String(flags["private-key"]) : undefined);
        } catch (error) {
          fail(`Could not read the signing key: ${error instanceof Error ? error.message : error}`);
        }
        let signing = null;
        if (privateKey) {
          const list = await api("GET", "/releases?limit=200");
          const target = list.find((r) => r.id === id);
          if (!target) fail("Release not found (needed to sign it).");
          signing = { key: privateKey, runtimeVersion: target.runtime_version, platform: target.platform };
        }
        const r = await uploadRelease(id ?? fail("release id required"), need(flags, "file"), signing);
        if (jsonMode) console.log(JSON.stringify({ ok: true, ...r }));
        return;
      }
      case "publish": {
        const r = await releaseAction(id ?? fail("release id required"), { action: "publish", rolloutPercentage: Number(flags.rollout ?? 100) });
        jsonMode ? console.log(JSON.stringify({ ok: true, ...r })) : console.log(`Published at ${r.rollout}%.`);
        return;
      }
      case "rollout": {
        const r = await releaseAction(id ?? fail("release id required"), { action: "rollout", rolloutPercentage: Number(need(flags, "percentage")) });
        jsonMode ? console.log(JSON.stringify({ ok: true, ...r })) : console.log(`Rollout set to ${r.rollout}%.`);
        return;
      }
      case "pause": {
        const r = await releaseAction(id ?? fail("release id required"), { action: "pause" });
        jsonMode ? console.log(JSON.stringify({ ok: true, ...r })) : console.log("Paused.");
        return;
      }
      case "rollback": {
        const r = await releaseAction(id ?? fail("release id required"), {
          action: "rollback",
          reason: need(flags, "reason"),
          ...(flags.target ? { targetReleaseId: String(flags.target) } : {}),
        });
        if (jsonMode) console.log(JSON.stringify({ ok: true, ...r }));
        else console.log(r.restoredReleaseId ? `Rolled back; now serving ${r.restoredReleaseId}.` : "Rolled back; channel has no active release.");
        return;
      }
      default:
        fail(`unknown release command: ${positional[0] ?? ""}\n\n${HELP}`);
    }
  }
  fail(`unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
