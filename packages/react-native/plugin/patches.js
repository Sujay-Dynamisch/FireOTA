/**
 * Source patches that make release builds load the latest verified FireOTA bundle.
 * Shared by the Expo config plugin (run on every `expo prebuild`) and kept identical to
 * packages/cli/lib/init.mjs (`npx fireota init`); tests/sdk/expo-plugin.test.ts checks they match.
 * Every patch is idempotent: running it on already-patched source returns status "already".
 */
"use strict";

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
  const last = imports[imports.length - 1];
  if (!last) return source.replace(/^(package .+)$/m, `$1\n\nimport ${IMPORT_SDK}`);
  const at = last.index + last[0].length;
  return `${source.slice(0, at)}\nimport ${IMPORT_SDK}${source.slice(at)}`;
}

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

/** Returns { source, status }: status is "patched", "already" or "unknown" (template not recognised). */
function patchMainApplication(source, isKotlin) {
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
  if (!patched.includes(`import ${IMPORT_SDK};`))
    patched = patched.replace(/^(package .+;)$/m, `$1\n\nimport ${IMPORT_SDK};`);
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

function patchAppDelegate(source, isSwift) {
  if (source.includes("fireOTABundleURL") || source.includes("[FireOTA bundleURL]"))
    return { source, status: "already" };
  if (isSwift) {
    const target = 'Bundle.main.url(forResource: "main", withExtension: "jsbundle")';
    if (!source.includes(target)) return { source, status: "unknown" };
    return {
      source: source.replace(target, `fireOTABundleURL() ?? ${target}`) + SWIFT_HELPER,
      status: "patched",
    };
  }
  const target = '[[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"]';
  if (!source.includes(target)) return { source, status: "unknown" };
  let patched = source.replace(target, `[FireOTA bundleURL] ?: ${target}`);
  patched = patched.replace(/^(#import .+)$/m, `$1\n#import <FireOTA.h>`);
  return { source: patched, status: "patched" };
}

module.exports = { patchMainApplication, patchAppDelegate };
