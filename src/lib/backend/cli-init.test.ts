import { describe, expect, it } from "vitest";

// @ts-expect-error -- untyped .mjs module
import { patchAppDelegate, patchEntry, patchMainApplication } from "../../../packages/cli/lib/init.mjs";

// React Native 0.87 template (as in a real app, before FireOTA).
const KOTLIN_087 = `package com.example.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(SmsPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

const KOTLIN_073 = `package com.example.app

import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {
  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> = PackageList(this).packages
        override fun getJSMainModuleName(): String = "index"
      }
}
`;

const JAVA = `package com.example.app;

import com.facebook.react.defaults.DefaultReactNativeHost;

public class MainApplication extends Application implements ReactApplication {
  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() { return BuildConfig.DEBUG; }
      };
}
`;

const SWIFT = `class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

const OBJC = `#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
`;

describe("fireota init: Android", () => {
  it("adds jsBundleFilePath to getDefaultReactHost (RN 0.76+)", () => {
    const { source, status } = patchMainApplication(KOTLIN_087, true);
    expect(status).toBe("patched");
    expect(source).toContain("import dev.fireota.reactnative.FireOTA");
    expect(source).toMatch(/},\n\s+\/\/ FireOTA[^\n]*\n\s+jsBundleFilePath = if \(BuildConfig.DEBUG\) null else FireOTA.getJSBundleFile\(applicationContext\),\n\s+\)/);
    // Idempotent
    expect(patchMainApplication(source, true).status).toBe("already");
  });

  it("overrides getJSBundleFile in DefaultReactNativeHost (older Kotlin)", () => {
    const { source, status } = patchMainApplication(KOTLIN_073, true);
    expect(status).toBe("patched");
    expect(source).toContain("override fun getJSBundleFile(): String?");
    expect(source).toContain("import dev.fireota.reactnative.FireOTA");
  });

  it("patches Java templates", () => {
    const { source, status } = patchMainApplication(JAVA, false);
    expect(status).toBe("patched");
    expect(source).toContain("protected String getJSBundleFile()");
    expect(source).toContain("import dev.fireota.reactnative.FireOTA;");
  });

  it("reports unknown templates instead of guessing", () => {
    expect(patchMainApplication("class MainApplication {}", true).status).toBe("unknown");
  });
});

describe("fireota init: iOS", () => {
  it("patches Swift without a bridging header", () => {
    const { source, status } = patchAppDelegate(SWIFT, true);
    expect(status).toBe("patched");
    expect(source).toContain('fireOTABundleURL() ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")');
    expect(source).toContain('NSClassFromString("FireOTA")');
    expect(patchAppDelegate(source, true).status).toBe("already");
  });

  it("patches Objective-C", () => {
    const { source, status } = patchAppDelegate(OBJC, false);
    expect(status).toBe("patched");
    expect(source).toContain("#import <FireOTA.h>");
    expect(source).toContain("[FireOTA bundleURL] ?: [[NSBundle mainBundle]");
  });
});

describe("fireota init: index.js", () => {
  it("wraps the root component", () => {
    const entry = `import { AppRegistry } from 'react-native';\nimport App from './App';\nimport { name as appName } from './app.json';\n\nAppRegistry.registerComponent(appName, () => App);\n`;
    const { source, status } = patchEntry(entry, "./fireota.config");
    expect(status).toBe("patched");
    expect(source).toContain("AppRegistry.registerComponent(appName, () => withFireOTA(App, fireotaConfig));");
    expect(source).toContain("import fireotaConfig from './fireota.config';");
    expect(patchEntry(source, "./fireota.config").status).toBe("already");
  });

  it("leaves projects that already call FireOTA.configure alone", () => {
    expect(patchEntry("FireOTA.configure({});\nAppRegistry.registerComponent(a, () => App);", "./x").status).toBe("manual-configure");
  });
});
