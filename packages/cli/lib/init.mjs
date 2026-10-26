/**
 * `npx fireota init` — wires FireOTA into a React Native project in one step:
 *   fireota.config.js   app ID, server URL, channel (no secrets; safe to commit)
 *   index.js            wraps the root component with withFireOTA(App, config)
 *   MainApplication     release builds load the latest verified OTA bundle (Android)
 *   AppDelegate         release builds load the latest verified OTA bundle (iOS)
 *   package.json        "ota:publish" script
 *   .gitignore          update packages and the code signing private key
 * Every step is idempotent and skipped when already done; nothing is overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { createInterface } from "node:readline/promises";

import { findFile, isExpoProject, storeVersion } from "./project.mjs";

const IMPORT_SDK = "dev.fireota.reactnative.FireOTA";

/** Finds the ")" that closes the "(" at `open`. */
function closingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function addKotlinImport(source) {
  if (source.includes(`import ${IMPORT_SDK}`)) return source;
  const imports = [...source.matchAll(/^import .+$/gm)];
  const last = imports.at(-1);
  if (!last) return source.replace(/^(package .+)$/m, `$1\n\nimport ${IMPORT_SDK}`);
  const at = last.index + last[0].length;
  return `${source.slice(0, at)}\nimport ${IMPORT_SDK}${source.slice(at)}`;
}

/** Returns the patched MainApplication source, or null when no known template matched. */
function addHostOverride(source) {
  const host = /object\s*:\s*DefaultReactNativeHost\(this\)\s*\{/.exec(source);
  if (!host) return null;
  const at = host.index + host[0].length;
  const method =
    "\n        // FireOTA: release builds load the latest verified OTA bundle.\n" +
    "        override fun getJSBundleFile(): String? =\n" +
    "          if (BuildConfig.DEBUG) super.getJSBundleFile()\n" +
    "          else FireOTA.getJSBundleFile(applicationContext) ?: super.getJSBundleFile()\n";
  return addKotlinImport(source.slice(0, at) + method + source.slice(at));
}

// Keep in sync with packages/react-native/plugin/patches.js (the Expo config plugin);
// tests/sdk/expo-plugin.test.ts checks both produce the same output.
export function patchMainApplication(source, isKotlin) {
  if (source.includes("FireOTA.getJSBundleFile")) return { source, status: "already" };
  if (isKotlin) {
    // Expo SDK 50–55: ReactNativeHostWrapper(this, object : DefaultReactNativeHost(this) { … }), and the host
    // factory of those SDKs takes no jsBundleFilePath — override getJSBundleFile() on the wrapped host.
    // Expo SDK 56+ calls ExpoReactHostFactory.getDefaultReactHost(context = …, packageList = …), which accepts
    // jsBundleFilePath like React Native's own factory, so it falls through to the branch below.
    if (source.includes("ReactNativeHostWrapper")) {
      const patched = addHostOverride(source);
      if (patched) return { source: patched, status: "patched" };
    }
    // React Native 0.76+: getDefaultReactHost(context = …, packageList = …)
    const call = source.indexOf("getDefaultReactHost(");
    if (call !== -1) {
      const open = call + "getDefaultReactHost".length;
      const close = closingParen(source, open);
      if (close !== -1) {
        let head = source.slice(0, close).replace(/\s+$/, "");
        if (!head.endsWith(",") && !head.endsWith("(")) head += ",";
        const patched =
          `${head}\n      // FireOTA: release builds load the latest verified OTA bundle (null = bundle in the APK).\n` +
          `      jsBundleFilePath = if (BuildConfig.DEBUG) null else FireOTA.getJSBundleFile(applicationContext),\n    ` +
          source.slice(close);
        return { source: addKotlinImport(patched), status: "patched" };
      }
    }
    // Older templates: object : DefaultReactNativeHost(this) { … }
    const patched = addHostOverride(source);
    return patched ? { source: patched, status: "patched" } : { source, status: "unknown" };
  }
  const host = /new\s+DefaultReactNativeHost\(this\)\s*\{/.exec(source);
  if (!host) return { source, status: "unknown" };
  const at = host.index + host[0].length;
  const method =
    "\n        // FireOTA: release builds load the latest verified OTA bundle.\n" +
    "        @Override\n        protected String getJSBundleFile() {\n" +
    "          if (BuildConfig.DEBUG) return super.getJSBundleFile();\n" +
    "          String ota = FireOTA.getJSBundleFile(getApplicationContext());\n" +
    "          return ota != null ? ota : super.getJSBundleFile();\n        }\n";
  let patched = source.slice(0, at) + method + source.slice(at);
  if (!patched.includes(`import ${IMPORT_SDK};`)) patched = patched.replace(/^(package .+;)$/m, `$1\n\nimport ${IMPORT_SDK};`);
  return { source: patched, status: "patched" };
}

const SWIFT_HELPER = `

/// FireOTA: the latest verified OTA bundle, or nil to use the one in the app binary.
/// Looked up at runtime, so no bridging header is needed.
private func fireOTABundleURL() -> URL? {
  guard let fireOTA: AnyClass = NSClassFromString("FireOTA") else { return nil }
  return (fireOTA as AnyObject).perform(NSSelectorFromString("bundleURL"))?.takeUnretainedValue() as? URL
}
`;

export function patchAppDelegate(source, isSwift) {
  if (source.includes("fireOTABundleURL") || source.includes("[FireOTA bundleURL]")) return { source, status: "already" };
  if (isSwift) {
    const target = 'Bundle.main.url(forResource: "main", withExtension: "jsbundle")';
    if (!source.includes(target)) return { source, status: "unknown" };
    return { source: source.replace(target, `fireOTABundleURL() ?? ${target}`) + SWIFT_HELPER, status: "patched" };
  }
  const target = '[[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"]';
  if (!source.includes(target)) return { source, status: "unknown" };
  let patched = source.replace(target, `[FireOTA bundleURL] ?: ${target}`);
  patched = patched.replace(/^(#import .+)$/m, `$1\n#import <FireOTA.h>`);
  return { source: patched, status: "patched" };
}

/** Wraps AppRegistry.registerComponent(name, () => App) with withFireOTA(App, fireotaConfig). */
export function patchEntry(source, configImport) {
  if (source.includes("withFireOTA")) return { source, status: "already" };
  if (source.includes("FireOTA.configure")) return { source, status: "manual-configure" };
  const re = /AppRegistry\.registerComponent\(\s*([^,]+?)\s*,\s*\(\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\)/;
  if (!re.test(source)) return { source, status: "unknown" };
  let patched = source.replace(re, "AppRegistry.registerComponent($1, () => withFireOTA($2, fireotaConfig))");
  const imports = [...patched.matchAll(/^import .+$/gm)];
  const last = imports.at(-1);
  const lines = `import { withFireOTA } from '@fireota/react-native';\nimport fireotaConfig from '${configImport}';`;
  patched = last ? `${patched.slice(0, last.index + last[0].length)}\n${lines}${patched.slice(last.index + last[0].length)}` : `${lines}\n${patched}`;
  return { source: patched, status: "patched" };
}

function addEntryImports(source, configImport) {
  const lines = `import { withFireOTA } from '@fireota/react-native';\nimport fireotaConfig from '${configImport}';`;
  const imports = [...source.matchAll(/^import .+$/gm)];
  const last = imports.at(-1);
  return last ? `${source.slice(0, last.index + last[0].length)}\n${lines}${source.slice(last.index + last[0].length)}` : `${lines}\n${source}`;
}

/** Expo (no router): registerRootComponent(App) -> registerRootComponent(withFireOTA(App, fireotaConfig)). */
export function patchRegisterRootComponent(source, configImport) {
  if (source.includes("withFireOTA")) return { source, status: "already" };
  const re = /registerRootComponent\(\s*([A-Za-z_$][\w$]*)\s*\)/;
  if (!re.test(source)) return { source, status: "unknown" };
  const patched = source.replace(re, "registerRootComponent(withFireOTA($1, fireotaConfig))");
  return { source: addEntryImports(patched, configImport), status: "patched" };
}

/** expo-router: wrap the root layout (app/_layout.tsx) — it is the root component of the app. */
export function patchExpoRouterLayout(source, configImport) {
  if (source.includes("withFireOTA")) return { source, status: "already" };
  const named = /export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(source);
  if (named) {
    const name = named[1];
    const patched = `${source.replace(named[0], `function ${name}(`).replace(/\s*$/, "")}\n\nexport default withFireOTA(${name}, fireotaConfig);\n`;
    return { source: addEntryImports(patched, configImport), status: "patched" };
  }
  const reexport = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(source);
  if (reexport) {
    const patched = source.replace(reexport[0], `export default withFireOTA(${reexport[1]}, fireotaConfig);`);
    return { source: addEntryImports(patched, configImport), status: "patched" };
  }
  return { source, status: "unknown" };
}

/** Adds "@fireota/react-native" to expo.plugins in app.json. */
export function addExpoPlugin(appJsonText) {
  const json = JSON.parse(appJsonText);
  const expo = json.expo ?? json;
  const plugins = Array.isArray(expo.plugins) ? expo.plugins : [];
  const has = plugins.some((p) => (Array.isArray(p) ? p[0] : p) === "@fireota/react-native");
  if (has) return { source: appJsonText, status: "already" };
  expo.plugins = [...plugins, "@fireota/react-native"];
  return { source: `${JSON.stringify(json, null, 2)}\n`, status: "patched" };
}

function configFile({ appId, serverUrl, channel, certificate }) {
  return `// FireOTA settings — created by \`npx fireota init\`. No secrets here; safe to commit.
// runtimeVersion defaults to the app's store version (Android versionName / iOS
// CFBundleShortVersionString): bump that version whenever native code changes.

/** @type {import('@fireota/react-native').FireOTAConfig} */
const fireotaConfig = {
  appId: '${appId}',
  serverUrl: '${serverUrl}',
  channel: __DEV__ ? 'development' : '${channel}',
  checkOnAppStart: true,
  installMode: 'nextRestart', // normal updates apply on the next launch (with a "Restart" prompt)
  mandatoryInstallMode: 'immediate',${certificate ? `\n  codeSigningCertificate: \`${certificate.trim()}\`,` : ""}
};

export default fireotaConfig;
`;
}

async function ask(question) {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function runInit(flags, { api, log, fail }) {
  if (!existsSync("package.json") || !existsSync(join("node_modules", "react-native"))) {
    fail("Run this from your React Native project root (react-native must be installed).");
  }
  if (!existsSync(join("node_modules", "@fireota", "react-native"))) {
    fail("Install the SDK first: npm install @fireota/react-native");
  }
  const dry = Boolean(flags["dry-run"]);
  const results = [];
  const write = (path, content, label) => {
    if (!dry) writeFileSync(path, content);
    results.push(["✓", label]);
  };

  // 1. Settings ------------------------------------------------------------
  let serverUrl = String(flags["server-url"] ?? process.env.FIREOTA_URL ?? "").replace(/\/+$/, "");
  let appId = String(flags.app ?? process.env.FIREOTA_APP_ID ?? "");
  if (!appId && process.env.FIREOTA_API_KEY && serverUrl) {
    const me = await api("GET", "/me");
    if (me.apps.length === 1) appId = me.apps[0].id;
    else if (me.apps.length > 1) {
      log("Applications in this workspace:");
      for (const app of me.apps) log(`  ${app.id}  ${app.name}`);
    }
  }
  if (!serverUrl) serverUrl = (await ask("FireOTA URL (e.g. https://fireota.example.com): ")).replace(/\/+$/, "");
  if (!appId) appId = await ask("App ID (Dashboard → Applications → your app): ");
  if (!serverUrl || !appId) fail("Pass --server-url and --app (or set FIREOTA_URL and FIREOTA_APP_ID).");
  const channel = String(flags.channel ?? "production");

  const configPath = "fireota.config.js";
  const certificatePath = join("fireota-keys", "fireota-public.pem");
  const certificate = existsSync(certificatePath) ? readFileSync(certificatePath, "utf8") : null;
  if (existsSync(configPath) && !flags.force) results.push(["–", `${configPath} exists (kept; --force to rewrite)`]);
  else write(configPath, configFile({ appId, serverUrl, channel, certificate }), `${configPath} created${certificate ? " (with code signing certificate)" : ""}`);

  // 2. JS entry ------------------------------------------------------------
  const expo = isExpoProject();
  const pkgMain = JSON.parse(readFileSync("package.json", "utf8")).main ?? "";
  const entry = ["index.js", "index.ts", "index.tsx"].find((f) => existsSync(f));
  if (expo && /expo-router\/entry/.test(pkgMain)) {
    // expo-router: the root layout is the app's root component.
    const layout = ["app", join("src", "app")]
      .flatMap((dir) => ["_layout.tsx", "_layout.jsx", "_layout.ts", "_layout.js"].map((f) => join(dir, f)))
      .find((f) => existsSync(f));
    if (!layout) results.push(["!", "expo-router: no app/_layout.tsx found — wrap your root layout: export default withFireOTA(RootLayout, fireotaConfig)"]);
    else {
      const configImport = relative(dirname(layout), "fireota.config").split(sep).join("/");
      const res = patchExpoRouterLayout(readFileSync(layout, "utf8"), configImport.startsWith(".") ? configImport : `./${configImport}`);
      const rel = relative(".", layout);
      if (res.status === "patched") write(layout, res.source, `${rel}: root layout wrapped with withFireOTA()`);
      else if (res.status === "already") results.push(["–", `${rel} already uses withFireOTA`]);
      else results.push(["!", `${rel}: wrap your root layout manually: export default withFireOTA(RootLayout, fireotaConfig)`]);
    }
  } else if (!entry) results.push(["!", "No index.js found — wrap your root component: withFireOTA(App, fireotaConfig)"]);
  else if (expo && /registerRootComponent\(/.test(readFileSync(entry, "utf8"))) {
    const res = patchRegisterRootComponent(readFileSync(entry, "utf8"), "./fireota.config");
    if (res.status === "patched") write(entry, res.source, `${entry}: root component wrapped with withFireOTA()`);
    else if (res.status === "already") results.push(["–", `${entry} already uses withFireOTA`]);
    else results.push(["!", `${entry}: wrap your root component manually: registerRootComponent(withFireOTA(App, fireotaConfig))`]);
  } else {
    const res = patchEntry(readFileSync(entry, "utf8"), "./fireota.config");
    if (res.status === "patched") write(entry, res.source, `${entry}: root component wrapped with withFireOTA()`);
    else if (res.status === "already") results.push(["–", `${entry} already uses withFireOTA`]);
    else if (res.status === "manual-configure") results.push(["–", `${entry} already calls FireOTA.configure() (left as is)`]);
    else results.push(["!", `${entry}: wrap your root component manually: withFireOTA(App, fireotaConfig)`]);
  }

  // 3. Expo config plugin --------------------------------------------------
  // `expo prebuild` / EAS Build regenerate android/ and ios/, so the plugin re-applies the native changes.
  if (expo) {
    if (existsSync("app.json")) {
      const res = addExpoPlugin(readFileSync("app.json", "utf8"));
      if (res.status === "patched") write("app.json", res.source, 'app.json: added the "@fireota/react-native" config plugin');
      else results.push(["–", "app.json already uses the FireOTA config plugin"]);
    } else {
      results.push(["!", 'app.config.js/ts: add "@fireota/react-native" to plugins (dynamic configs are not edited)']);
    }
    const deps = JSON.parse(readFileSync("package.json", "utf8"));
    if (deps.dependencies?.["expo-updates"] || deps.devDependencies?.["expo-updates"]) {
      results.push(["!", "expo-updates is installed — remove it (npm uninstall expo-updates); it cannot run alongside FireOTA"]);
    }
  }

  // 4. Android -------------------------------------------------------------
  const mainApp = findFile(join("android", "app", "src", "main"), (n) => n === "MainApplication.kt" || n === "MainApplication.java");
  if (!mainApp && expo) results.push(["–", "Android: no android/ folder yet — the config plugin wires it on expo prebuild / EAS Build"]);
  else if (!mainApp) results.push(["!", "Android: MainApplication not found — see the Android setup docs"]);
  else {
    const res = patchMainApplication(readFileSync(mainApp, "utf8"), mainApp.endsWith(".kt"));
    const rel = relative(".", mainApp);
    if (res.status === "patched") write(mainApp, res.source, `${rel}: loads the OTA bundle in release builds`);
    else if (res.status === "already") results.push(["–", `${rel} already loads FireOTA`]);
    else results.push(["!", `${rel}: unknown template — add FireOTA.getJSBundleFile() as in the Android setup docs`]);
  }

  // 5. iOS -----------------------------------------------------------------
  const delegate = findFile("ios", (n) => n === "AppDelegate.swift" || n === "AppDelegate.mm" || n === "AppDelegate.m", 3);
  if (!delegate && expo) results.push(["–", "iOS: no ios/ folder yet — the config plugin wires it on expo prebuild / EAS Build"]);
  else if (!delegate) results.push(["–", "iOS: no AppDelegate found (skipped)"]);
  else {
    const res = patchAppDelegate(readFileSync(delegate, "utf8"), delegate.endsWith(".swift"));
    const rel = relative(".", delegate);
    if (res.status === "patched") write(delegate, res.source, `${rel}: loads the OTA bundle in release builds (run pod install)`);
    else if (res.status === "already") results.push(["–", `${rel} already loads FireOTA`]);
    else results.push(["!", `${rel}: unknown template — return [FireOTA bundleURL] in bundleURL (see iOS setup docs)`]);
  }

  // 6. package.json script + .gitignore ------------------------------------
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  pkg.scripts ??= {};
  if (pkg.scripts["ota:publish"]) results.push(["–", 'package.json already has "ota:publish"']);
  else {
    pkg.scripts["ota:publish"] = "fireota publish --platform all";
    write("package.json", `${JSON.stringify(pkg, null, 2)}\n`, 'package.json: added "ota:publish" script');
  }
  const ignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
  const missing = ["*.fota", "fireota-keys/fireota-private.pem"].filter((line) => !ignore.split(/\r?\n/).includes(line));
  if (missing.length === 0) results.push(["–", ".gitignore already covers FireOTA files"]);
  else write(".gitignore", `${ignore.replace(/\s*$/, "\n")}\n# FireOTA\n${missing.join("\n")}\n`, `.gitignore: ignores ${missing.join(", ")}`);

  const runtime = { android: storeVersion("android"), ios: storeVersion("ios") };
  return { results, dry, appId, serverUrl, channel, runtime, expo };
}
