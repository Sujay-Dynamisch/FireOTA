#!/usr/bin/env node
/**
 * FireOTA CLI — build update packages and manage releases from a terminal or CI.
 * Needs Node 18+. Configuration via environment:
 *   FIREOTA_URL      your FireOTA deployment, e.g. https://ota.example.com
 *   FIREOTA_API_KEY  an API key from Settings -> API keys (fota_sk_...)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { packDirectory } from "../lib/package.mjs";

const HELP = `FireOTA CLI

Usage:
  fireota bundle   --platform <android|ios> [--entry index.js] [--out update.fota] [--hermes auto|on|off]
  fireota publish  --app <appId> --platform <android|ios> --version <x.y.z> --runtime <x.y.z>
                   [--channel production] [--rollout 10] [--notes "..."] [--mandatory] [--native ">=1.4.0"]
                   [--file update.fota]          (builds the package first when --file is omitted)
  fireota release create   --app <appId> --platform <p> --version <v> --runtime <r> [--channel c] [--notes n] [--mandatory] [--native c]
  fireota release upload   <releaseId> --file update.fota
  fireota release publish  <releaseId> [--rollout 100]
  fireota release rollout  <releaseId> --percentage <0-100>
  fireota release pause    <releaseId>
  fireota release rollback <releaseId> --reason "..." [--target <releaseId>]
  fireota releases [--app <appId>]

Environment: FIREOTA_URL, FIREOTA_API_KEY. Run from your React Native project root.`;

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
  console.error(`fireota: ${message}`);
  process.exit(1);
}

function need(flags, key) {
  const value = flags[key];
  if (value === undefined || value === true) fail(`--${key} is required`);
  return String(value);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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
function bundle(flags) {
  const platform = need(flags, "platform");
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
    console.log(`Bundling ${entry} for ${platform}…`);
    // Run the project's own React Native CLI through Node: no shell, same on every OS.
    execFileSync(
      process.execPath,
      [join("node_modules", "react-native", "cli.js"), "bundle", "--platform", platform, "--dev", "false", "--minify", "false", "--entry-file", entry, "--bundle-output", jsOut, "--assets-dest", out],
      { stdio: "inherit" },
    );
    // The bundler only creates the assets folder when the app has images.
    mkdirSync(out, { recursive: true });
    if (hermesEnabled(platform, String(flags.hermes ?? "auto"))) {
      console.log("Compiling to Hermes bytecode…");
      execFileSync(hermesc(), ["-O", "-w", "-emit-binary", "-out", join(out, bundleName), jsOut], { stdio: "inherit" });
    } else {
      writeFileSync(join(out, bundleName), readFileSync(jsOut));
    }
    const packed = packDirectory(out);
    const target = resolve(String(flags.out ?? `fireota-${platform}.fota`));
    writeFileSync(target, packed);
    console.log(`Package: ${target}\nSize:    ${(packed.length / 1024 / 1024).toFixed(2)} MB\nSHA-256: ${sha256(packed)}`);
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
  const headers = { authorization: `Bearer ${key}`, ...extraHeaders };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${base.replace(/\/+$/, "")}/api/public/v1${path}`, { method, headers, body: payload });
  let json;
  try {
    json = await response.json();
  } catch {
    fail(`Unexpected response from FireOTA (HTTP ${response.status}).`);
  }
  if (!json.success) fail(`${json.error?.code ?? "ERROR"}: ${json.error?.message ?? "request failed"}`);
  return json.data;
}

async function createRelease(flags) {
  const body = {
    appId: need(flags, "app"),
    channel: String(flags.channel ?? "production"),
    platform: need(flags, "platform"),
    version: need(flags, "version"),
    runtimeVersion: need(flags, "runtime"),
    ...(flags.notes ? { releaseNotes: String(flags.notes) } : {}),
    ...(flags.mandatory ? { mandatory: true } : {}),
    ...(flags.native ? { nativeVersionConstraint: String(flags.native) } : {}),
    ...(process.env.GITHUB_SHA ? { gitCommitSha: process.env.GITHUB_SHA } : {}),
    ...(process.env.GITHUB_REF_NAME ? { gitBranch: process.env.GITHUB_REF_NAME } : {}),
  };
  // Same inputs -> same release, so a retried CI job never creates duplicates.
  const idempotencyKey = sha256(Buffer.from(JSON.stringify(body)));
  const release = await api("POST", "/releases", body, { "idempotency-key": idempotencyKey });
  console.log(`Release #${release.number} (${release.id}) — ${release.status}`);
  return release;
}

async function uploadRelease(releaseId, file) {
  if (!existsSync(file)) fail(`File not found: ${file}`);
  const bytes = readFileSync(file);
  const form = new FormData();
  form.append("bundle", new Blob([bytes], { type: "application/octet-stream" }), "update.fota");
  console.log(`Uploading ${(bytes.length / 1024 / 1024).toFixed(2)} MB…`);
  const result = await api("POST", `/releases/${releaseId}/bundle`, form, { "x-bundle-sha256": sha256(bytes) });
  console.log(`Verified in your Firebase Storage. SHA-256 ${result.checksum}`);
  return result;
}

async function releaseAction(releaseId, body) {
  return api("POST", `/releases/${releaseId}/publish`, body);
}

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs([sub, ...rest].filter((v) => v !== undefined));

  if (!command || command === "help" || command === "--help" || flags.help) {
    console.log(HELP);
    return;
  }
  if (command === "bundle") {
    bundle(parseArgs(process.argv.slice(3)).flags);
    return;
  }
  if (command === "releases") {
    const query = flags.app ? `?appId=${encodeURIComponent(String(flags.app))}` : "";
    const rows = await api("GET", `/releases${query}`);
    for (const r of rows) {
      console.log(`#${r.number}\t${r.platform}\t${r.version}\t${r.status}\t${r.rollout_percentage}%\t${r.id}`);
    }
    return;
  }
  if (command === "publish") {
    const all = parseArgs(process.argv.slice(3)).flags;
    const file = all.file ? String(all.file) : bundle(all);
    const release = await createRelease(all);
    await uploadRelease(release.id, file);
    const result = await releaseAction(release.id, { action: "publish", rolloutPercentage: Number(all.rollout ?? 100) });
    console.log(`Published #${release.number} at ${result.rollout}%.`);
    return;
  }
  if (command === "release") {
    const id = positional[1];
    switch (positional[0]) {
      case "create":
        await createRelease(flags);
        return;
      case "upload":
        await uploadRelease(id ?? fail("release id required"), need(flags, "file"));
        return;
      case "publish": {
        const r = await releaseAction(id ?? fail("release id required"), { action: "publish", rolloutPercentage: Number(flags.rollout ?? 100) });
        console.log(`Published at ${r.rollout}%.`);
        return;
      }
      case "rollout": {
        const r = await releaseAction(id ?? fail("release id required"), { action: "rollout", rolloutPercentage: Number(need(flags, "percentage")) });
        console.log(`Rollout set to ${r.rollout}%.`);
        return;
      }
      case "pause":
        await releaseAction(id ?? fail("release id required"), { action: "pause" });
        console.log("Paused.");
        return;
      case "rollback": {
        const r = await releaseAction(id ?? fail("release id required"), {
          action: "rollback",
          reason: need(flags, "reason"),
          ...(flags.target ? { targetReleaseId: String(flags.target) } : {}),
        });
        console.log(r.restoredReleaseId ? `Rolled back; now serving ${r.restoredReleaseId}.` : "Rolled back; channel has no active release.");
        return;
      }
      default:
        fail(`unknown release command: ${positional[0] ?? ""}\n\n${HELP}`);
    }
  }
  fail(`unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
