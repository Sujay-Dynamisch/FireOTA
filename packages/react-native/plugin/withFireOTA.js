/**
 * Expo config plugin for FireOTA. Add it to app.json and every `expo prebuild` / EAS Build
 * re-applies the native changes, so Continuous Native Generation never wipes them:
 *
 *   { "expo": { "plugins": ["@fireota/react-native"] } }
 *
 * Android: MainApplication's React Native host loads FireOTA.getJSBundleFile() in release builds.
 * iOS:     AppDelegate's bundleURL() returns the FireOTA bundle in release builds.
 * Debug builds keep using Metro. The runtime version stays the store version (`expo.version`).
 */
"use strict";

const path = require("path");
const { patchAppDelegate, patchMainApplication } = require("./patches");

function configPlugins() {
  // `expo/config-plugins` is what Expo recommends; @expo/config-plugins is the same package for older SDKs.
  try {
    return require("expo/config-plugins");
  } catch {
    return require("@expo/config-plugins");
  }
}

const { createRunOncePlugin, withAppDelegate, withMainApplication } = configPlugins();
const pkg = require("../package.json");

/** expo-updates also replaces the JS bundle at launch; two update systems would fight over it. */
function assertNoExpoUpdates(projectRoot, allowExpoUpdates) {
  if (allowExpoUpdates || !projectRoot) return;
  let found = false;
  try {
    require.resolve("expo-updates/package.json", { paths: [projectRoot] });
    found = true;
  } catch {
    found = false;
  }
  if (found) {
    throw new Error(
      "[@fireota/react-native] expo-updates is installed. FireOTA and expo-updates both replace the JS bundle " +
        "at launch and cannot be used together. Remove it (npm uninstall expo-updates) or, if you are migrating, " +
        'pass { "allowExpoUpdates": true } to the FireOTA plugin and disable expo-updates ("updates": { "enabled": false }).',
    );
  }
}

function warnUnknown(platform, file) {
  console.warn(
    `[@fireota/react-native] ${platform}: could not find the expected code in ${file}. ` +
      "Release builds will keep using the bundle in the app binary. See https://fireota.creoai.in/docs/expo",
  );
}

const withFireOTA = (config, props = {}) => {
  const projectRoot = (config._internal && config._internal.projectRoot) || process.cwd();
  assertNoExpoUpdates(projectRoot, Boolean(props.allowExpoUpdates));

  config = withMainApplication(config, (mod) => {
    const result = patchMainApplication(mod.modResults.contents, mod.modResults.language === "kt");
    if (result.status === "unknown")
      warnUnknown("Android", path.basename(mod.modRequest.modFilePath || "MainApplication"));
    mod.modResults.contents = result.source;
    return mod;
  });

  config = withAppDelegate(config, (mod) => {
    const result = patchAppDelegate(mod.modResults.contents, mod.modResults.language === "swift");
    if (result.status === "unknown")
      warnUnknown("iOS", path.basename(mod.modRequest.modFilePath || "AppDelegate"));
    mod.modResults.contents = result.source;
    return mod;
  });

  return config;
};

module.exports = createRunOncePlugin(withFireOTA, pkg.name, pkg.version);
