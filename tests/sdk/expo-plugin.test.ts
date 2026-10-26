/**
 * Expo support: the config plugin's native patches (run on every `expo prebuild`) must match
 * `fireota init`'s, work on the Expo templates we support, and be idempotent. Fixtures are the
 * real generated files of Expo SDK 58 (React Native 0.88) and the older ReactNativeHostWrapper
 * template (Expo SDK 50–55), plus the JS entry points `fireota init` wires for Expo.
 */
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM module without type declarations
import * as cli from "../../packages/cli/lib/init.mjs";

const plugin = createRequire(import.meta.url)(
  "../../packages/react-native/plugin/patches.js",
) as typeof cli;

const EXPO_58_MAIN_APPLICATION = `package com.anonymous.expotest

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // add(MyReactNativePackage())
        }
    )
  }
}
`;

const EXPO_WRAPPER_MAIN_APPLICATION = `package com.example.app

import android.app.Application
import com.facebook.react.ReactNativeHost
import com.facebook.react.defaults.DefaultReactNativeHost
import expo.modules.ReactNativeHostWrapper
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> = PackageList(this).packages
          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"
          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
        }
  )

  override val reactHost: ReactHost
    get() = ExpoReactHostFactory.getDefaultReactHost(applicationContext, reactNativeHost)
}
`;

const EXPO_58_APP_DELEGATE = `internal import Expo
import React

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

describe("Expo config plugin patches", () => {
  it("passes the OTA bundle to ExpoReactHostFactory on Expo SDK 56+", () => {
    const { source, status } = plugin.patchMainApplication(EXPO_58_MAIN_APPLICATION, true);
    expect(status).toBe("patched");
    expect(source).toContain(
      "jsBundleFilePath = if (BuildConfig.DEBUG) null else FireOTA.getJSBundleFile(applicationContext),",
    );
    expect(source).toContain("import dev.fireota.reactnative.FireOTA");
    // The argument lands inside the factory call, after packageList.
    expect(source.indexOf("jsBundleFilePath")).toBeGreaterThan(source.indexOf("packageList ="));
    expect(source).toMatch(/jsBundleFilePath = [^\n]+,\n\s*\)\n\s*\}/);
  });

  it("overrides getJSBundleFile on the wrapped host for Expo SDK 50–55", () => {
    const { source, status } = plugin.patchMainApplication(EXPO_WRAPPER_MAIN_APPLICATION, true);
    expect(status).toBe("patched");
    expect(source).toContain("override fun getJSBundleFile(): String? =");
    // That factory has no jsBundleFilePath parameter: adding one would not compile.
    expect(source).not.toContain("jsBundleFilePath =");
  });

  it("makes AppDelegate.swift prefer the OTA bundle in release builds", () => {
    const { source, status } = plugin.patchAppDelegate(EXPO_58_APP_DELEGATE, true);
    expect(status).toBe("patched");
    expect(source).toContain(
      'return fireOTABundleURL() ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
    );
    expect(source).toContain("private func fireOTABundleURL() -> URL?");
    // Debug builds keep using Metro.
    expect(source).toContain('jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")');
  });

  it("is idempotent, as every prebuild re-runs it", () => {
    const once = plugin.patchMainApplication(EXPO_58_MAIN_APPLICATION, true).source;
    const twice = plugin.patchMainApplication(once, true);
    expect(twice.status).toBe("already");
    expect(twice.source).toBe(once);
    const ios = plugin.patchAppDelegate(EXPO_58_APP_DELEGATE, true).source;
    expect(plugin.patchAppDelegate(ios, true).status).toBe("already");
  });

  it("produces exactly what `fireota init` produces", () => {
    for (const fixture of [EXPO_58_MAIN_APPLICATION, EXPO_WRAPPER_MAIN_APPLICATION]) {
      expect(plugin.patchMainApplication(fixture, true)).toEqual(
        cli.patchMainApplication(fixture, true),
      );
    }
    expect(plugin.patchAppDelegate(EXPO_58_APP_DELEGATE, true)).toEqual(
      cli.patchAppDelegate(EXPO_58_APP_DELEGATE, true),
    );
  });

  it("reports unknown templates instead of guessing", () => {
    expect(plugin.patchMainApplication("class MainApplication : Application()", true).status).toBe(
      "unknown",
    );
    expect(plugin.patchAppDelegate("class AppDelegate {}", true).status).toBe("unknown");
  });
});

describe("fireota init for Expo", () => {
  it("wraps the expo-router root layout", () => {
    const layout = `import { Stack } from 'expo-router';\n\nexport default function RootLayout() {\n  return <Stack />;\n}\n`;
    const { source, status } = cli.patchExpoRouterLayout(layout, "../fireota.config");
    expect(status).toBe("patched");
    expect(source).toContain("function RootLayout() {");
    expect(source).not.toContain("export default function");
    expect(source).toContain("export default withFireOTA(RootLayout, fireotaConfig);");
    expect(source).toContain("import fireotaConfig from '../fireota.config';");
    expect(cli.patchExpoRouterLayout(source, "../fireota.config").status).toBe("already");
  });

  it("wraps registerRootComponent(App)", () => {
    const entry = `import { registerRootComponent } from 'expo';\nimport App from './App';\n\nregisterRootComponent(App);\n`;
    const { source, status } = cli.patchRegisterRootComponent(entry, "./fireota.config");
    expect(status).toBe("patched");
    expect(source).toContain("registerRootComponent(withFireOTA(App, fireotaConfig));");
  });

  it("adds the config plugin to app.json once", () => {
    const appJson = JSON.stringify({ expo: { name: "x", plugins: ["expo-router"] } });
    const first = cli.addExpoPlugin(appJson);
    expect(first.status).toBe("patched");
    expect(JSON.parse(first.source).expo.plugins).toEqual(["expo-router", "@fireota/react-native"]);
    expect(cli.addExpoPlugin(first.source).status).toBe("already");
  });
});
