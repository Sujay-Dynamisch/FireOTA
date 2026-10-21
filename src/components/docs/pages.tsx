/**
 * FireOTA documentation content. Every page lists its sections so the layout can render the
 * "On this page" table of contents. Add a page by adding an entry; routing is automatic.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ProductVideo } from "@/components/fireota/product-video";

import { Bullets, C, Callout, Code, ExtLink, PlatformTabs, Steps } from "./docs-ui";
import {
  AddAppMock,
  AnalyticsEventsMock,
  ApiKeyMock,
  AppIdMock,
  ChannelsMock,
  ConnectFirebaseMock,
  CustomPromptMock,
  Figure,
  FirebaseStorageMock,
  LaunchLifecycleDiagram,
  ProjectTreeMock,
  RolloutBucketsDiagram,
  RuntimeMatchDiagram,
  RuntimesMock,
  TerminalFrame,
  ThemeCompareMock,
  UpdateFlowDiagram,
  UpdatePromptMocks,
  XcodeBridgingMock,
} from "./figures";

export interface DocSection {
  id: string;
  title: string;
  body: ReactNode;
}
export interface DocPage {
  slug: string;
  title: string;
  description: string;
  sections: DocSection[];
}
export interface DocGroup {
  title: string;
  icon: string;
  pages: DocPage[];
}

function D({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to="/docs/$slug" params={{ slug: to }} className="text-brand underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
function A({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to as never} className="text-brand underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

const CONFIGURE = `// index.js — before AppRegistry.registerComponent
import FireOTA from "@fireota/react-native";

FireOTA.configure({
  appId: "YOUR_APP_ID",                // Applications -> your app -> App ID
  serverUrl: "https://ota.example.com", // your FireOTA URL
  runtimeVersion: "1.3.0",             // must match this store build
  channel: __DEV__ ? "development" : "production",
  checkOnAppStart: true,               // check + download in the background on launch
  installMode: "nextRestart",          // normal updates apply on the next cold start
  mandatoryInstallMode: "immediate",   // mandatory updates restart the app right away
});`;

const ANDROID_KOTLIN = `// android/app/src/main/java/<your/package>/MainApplication.kt
import dev.fireota.reactnative.FireOTA

override val reactNativeHost: ReactNativeHost =
  object : DefaultReactNativeHost(this) {
    // ...existing overrides...

    // Release builds load the latest verified OTA bundle; debug builds keep using Metro.
    override fun getJSBundleFile(): String? =
      if (BuildConfig.DEBUG) super.getJSBundleFile()
      else FireOTA.getJSBundleFile(applicationContext) ?: super.getJSBundleFile()
  }`;

const ANDROID_JAVA = `// android/app/src/main/java/<your/package>/MainApplication.java
import dev.fireota.reactnative.FireOTA;

@Override
protected String getJSBundleFile() {
  if (BuildConfig.DEBUG) return super.getJSBundleFile();
  String ota = FireOTA.getJSBundleFile(getApplicationContext());
  return ota != null ? ota : super.getJSBundleFile();
}`;

const ANDROID_HOST = `// android/app/src/main/java/<your/package>/MainApplication.kt  (React Native 0.76+ template)
import dev.fireota.reactnative.FireOTA

override val reactHost: ReactHost by lazy {
  getDefaultReactHost(
    context = applicationContext,
    packageList = PackageList(this).packages,
    // Release builds load the latest verified OTA bundle; debug builds keep using Metro.
    jsBundleFilePath = if (BuildConfig.DEBUG) null else FireOTA.getJSBundleFile(applicationContext),
  )
}`;

const IOS_OBJC = `// ios/<App>/AppDelegate.mm
#import <FireOTA.h>

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [FireOTA bundleURL] ?: [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}`;

const IOS_SWIFT = `// Bridging header:  #import <FireOTA.h>
// Then in AppDelegate.swift (RN 0.77-0.78) or class ReactNativeDelegate (RN 0.79+):
override func bundleURL() -> URL? {
#if DEBUG
  return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
  return FireOTA.bundleURL() ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
}`;

const IOS_SCENE = `// ios/<App>/SceneDelegate.swift  (React Native 0.88+ template)
override func bundleURL() -> URL? {
  #if DEBUG
  RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
  #else
  FireOTA.bundleURL() ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")
  #endif
}`;

const IOS_BRIDGING = `// ios/<App>/<App>-Bridging-Header.h
#import <FireOTA.h>`;

const INIT_OUTPUT = [
  "$ npx fireota init --app 83822cef-… --server-url https://ota.example.com",
  "",
  "FireOTA is set up:",
  "",
  "  ✓ fireota.config.js created",
  "  ✓ index.js: root component wrapped with withFireOTA()",
  "  ✓ android/app/src/main/java/com/myapp/MainApplication.kt: loads the OTA bundle in release builds",
  "  ✓ ios/MyApp/AppDelegate.swift: loads the OTA bundle in release builds (run pod install)",
  '  ✓ package.json: added "ota:publish" script',
  "  ✓ .gitignore: ignores *.fota, fireota-keys/fireota-private.pem",
  "",
  "Runtime version: Android 1.0.0, iOS 1.0.0 (your store version — bump it when native code changes).",
];

const PUBLISH_OUTPUT = [
  '$ npx fireota publish --app 83822cef-… --platform android --runtime 1.0.0 --channel beta --message "Fix checkout crash"',
  "Bundling index.js for android…",
  "Compiling to Hermes bytecode…",
  "Package: android.fota",
  "Size:    1.84 MB",
  "SHA-256: 9b1e4c…a07d",
  "Update #3 (3f9a12c0-…) — draft [android, local]",
  "Uploading 1.84 MB…",
  "Verified in your Firebase Storage. SHA-256 9b1e4c…a07d",
  "Published update #3 (android) at 100%.",
];

const CONFIG_FILE = `// fireota.config.js — created by \`npx fireota init\`. No secrets; safe to commit.
const fireotaConfig = {
  appId: "83822cef-18b1-453c-b67c-3c546a5439e8",
  serverUrl: "https://ota.example.com",
  channel: "production",
  checkOnAppStart: true,
  installMode: "nextRestart",       // normal updates apply on the next launch
  mandatoryInstallMode: "immediate",
};
export default fireotaConfig;

// index.js
import { withFireOTA } from "@fireota/react-native";
import fireotaConfig from "./fireota.config";
AppRegistry.registerComponent(appName, () => withFireOTA(App, fireotaConfig));`;

const UI_THEME = `// index.js
import { AppRegistry } from "react-native";
import { withFireOTA } from "@fireota/react-native";
import App from "./App";
import { name as appName } from "./app.json";
import fireotaConfig from "./fireota.config";

AppRegistry.registerComponent(appName, () =>
  withFireOTA(App, fireotaConfig, {
    theme: {
      accent: "#6D28D9",     // Restart button, spinner, primary buttons
      background: "#FFFFFF", // mandatory-update screen and <UpdateScreen /> background
      card: "#F4F1FB",       // the prompt card and <UpdateScreen /> cards
      text: "#1F1235",       // titles and values
      muted: "#6B6280",      // message, "Later", labels
      danger: "#DC2626",     // error text
    },
  }),
);`;

const UI_TEXT = `// index.js — turn the built-in prompt off…
AppRegistry.registerComponent(appName, () => withFireOTA(App, fireotaConfig, { prompt: false }));

// App.tsx — …and render it yourself with your own text
import { UpdatePrompt } from "@fireota/react-native";

export default function App() {
  return (
    <>
      <RootNavigator />
      <UpdatePrompt title="New version available" message="Restart to get the latest fixes." />
    </>
  );
}`;

const UI_RENDER_PROMPT = `// index.js — use FireOTAProvider instead of withFireOTA to pass renderPrompt
import { AppRegistry } from "react-native";
import { FireOTAProvider } from "@fireota/react-native";
import App from "./App";
import { name as appName } from "./app.json";
import fireotaConfig from "./fireota.config";
import { UpdateBanner } from "./src/UpdateBanner";

function Root() {
  return (
    <FireOTAProvider
      config={fireotaConfig}
      theme={{ accent: "#059669" }}          // optional, also used by <UpdateScreen />
      renderPrompt={(ota) => <UpdateBanner ota={ota} />}
    >
      <App />
    </FireOTAProvider>
  );
}

AppRegistry.registerComponent(appName, () => Root);`;

const UI_BANNER = `// src/UpdateBanner.tsx
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { FireOTAContextValue } from "@fireota/react-native";

export function UpdateBanner({ ota }: { ota: FireOTAContextValue }) {
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const { status, available, pendingReleaseId, currentReleaseId, restart, busy } = ota;

  // 1. Mandatory update downloading: block the app until it restarts.
  if (available?.mandatory && (status === "downloading" || status === "downloaded")) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.blocker}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.blockerText}>Installing an important update…</Text>
        </View>
      </Modal>
    );
  }

  // 2. Normal update downloaded and waiting for a restart.
  const ready = status === "installed" && pendingReleaseId && pendingReleaseId !== currentReleaseId;
  if (!ready || hiddenFor === pendingReleaseId) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.text} numberOfLines={1}>
        {available?.message || "A new version is ready"}
      </Text>
      <Pressable onPress={() => setHiddenFor(pendingReleaseId)}>
        <Text style={styles.later}>Later</Text>
      </Pressable>
      <Pressable style={styles.button} disabled={busy} onPress={restart}>
        <Text style={styles.buttonText}>Update</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", top: 48, left: 12, right: 12, flexDirection: "row", alignItems: "center",
         gap: 12, padding: 12, borderRadius: 12, backgroundColor: "#059669" },
  text: { flex: 1, color: "#fff", fontWeight: "600" },
  later: { color: "#D1FAE5" },
  button: { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  buttonText: { color: "#047857", fontWeight: "700" },
  blocker: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "rgba(0,0,0,0.85)" },
  blockerText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});`;

const UI_HOOK = `// Any screen, e.g. Settings → "About this app"
import { Button, Text, View } from "react-native";
import { useFireOTA } from "@fireota/react-native";

export function AboutUpdates() {
  const { status, available, currentReleaseId, runtimeVersion, channel, error, busy, check, install, restart } = useFireOTA();

  return (
    <View>
      <Text>Runtime {runtimeVersion} · {channel}</Text>
      <Text>Running {currentReleaseId ? \`update \${currentReleaseId.slice(0, 8)}\` : "the store build"}</Text>
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}

      {status === "installed" ? (
        <Button title="Restart to apply the update" onPress={restart} />
      ) : available ? (
        <>
          <Text>{available.message || "Improvements and fixes."}</Text>
          <Button title="Download update" disabled={busy} onPress={install} />
        </>
      ) : (
        <Button title={status === "checking" ? "Checking…" : "Check for updates"} disabled={busy} onPress={check} />
      )}
    </View>
  );
}`;

const UI_MANUAL_FLOW = `// fireota.config.js — stop the automatic check
const fireotaConfig = { /* appId, serverUrl, channel… */ checkOnAppStart: false };

// Later, when it suits your app (e.g. after login):
import FireOTA from "@fireota/react-native";

const result = await FireOTA.checkForUpdate();
if (result.updateAvailable && result.release) {
  await FireOTA.downloadUpdate(result.release);
  await FireOTA.installUpdate(result.release, "nextRestart"); // or "immediate"
}`;

const PUBLISH = `export FIREOTA_URL="https://ota.example.com"
export FIREOTA_API_KEY="fota_sk_live_..."   # Settings -> API keys

# from your React Native project root
npx fireota publish --app YOUR_APP_ID --platform all \\
  --runtime 1.3.0 --channel beta --rollout 10 \\
  --message "Fix crash on the budget screen"`;

const MANUAL = `npx fireota bundle --platform android --out android.fota   # bundle + Hermes + assets
npx fireota release create --app YOUR_APP_ID --platform android --runtime 1.3.0 --message "Fix crash"
npx fireota release upload <releaseId> --file android.fota     # checksum-verified into your bucket
npx fireota release publish <releaseId> --rollout 10`;

const GITHUB = `# .github/workflows/ota.yml
name: OTA update
on:
  push:
    branches: [main]
jobs:
  publish:
    runs-on: ubuntu-latest
    runs-on: macos-latest          # macOS builds both Android and iOS bundles
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: >
          npx fireota publish --app \${{ vars.FIREOTA_APP_ID }} --platform all
          --runtime 1.3.0 --channel beta --rollout 100
          --message "\${{ github.event.head_commit.message }}"
        env:
          FIREOTA_URL: \${{ vars.FIREOTA_URL }}
          FIREOTA_API_KEY: \${{ secrets.FIREOTA_API_KEY }}
          FIREOTA_SIGNING_KEY: \${{ secrets.FIREOTA_SIGNING_KEY }}   # only with code signing`;

const ANY_CI = `# Works in any CI with Node 18+ (Jenkins, Bitbucket, GitLab, Azure DevOps, CircleCI, Bitrise, TeamCity…)
export FIREOTA_URL=https://ota.example.com          # FIREOTA_API_KEY comes from the CI's secret store
npm ci
npx fireota publish --app "$FIREOTA_APP_ID" --platform android --runtime 1.3.0 \\
  --channel production --rollout 10 --message "$(git log -1 --pretty=%s)" --json`;

const SIGNING = `npx fireota signing generate --out ./fireota-keys
#  fireota-keys/fireota-private.pem  -> keep secret (CI secret FIREOTA_SIGNING_KEY)
#  fireota-keys/fireota-public.pem   -> dashboard (app -> Code signing) + the app

npx fireota publish … --private-key ./fireota-keys/fireota-private.pem`;

const SIGNING_APP = `FireOTA.configure({
  appId: "YOUR_APP_ID",
  serverUrl: "https://ota.example.com",
  runtimeVersion: "1.3.0",
  codeSigningCertificate: PUBLIC_KEY_PEM, // contents of fireota-public.pem
});`;

const SDK_API = `FireOTA.configure(options)        // once, at startup (required)
FireOTA.sync()                    // check + download + install, honouring install modes
FireOTA.checkForUpdate()          // -> { updateAvailable, reason?, release? }
FireOTA.downloadUpdate(release)   // download + SHA-256 verify; the running bundle is untouched
FireOTA.installUpdate(release, "nextRestart" | "immediate")
FireOTA.reload()                  // restart now to apply a pending update
FireOTA.clearPendingUpdate()      // drop a downloaded update that is not applied yet
FireOTA.getCurrentRelease()       // -> { releaseId, pendingReleaseId, installationId }
FireOTA.getUpdateStatus()         // idle | checking | upToDate | downloading | downloaded | installed | error`;

const CHECK_API = `POST /api/public/v1/updates/check
{ "app": "<appId>", "channel": "production", "platform": "android",
  "installationId": "<stable id>", "runtimeVersion": "1.3.0",
  "nativeVersion": "1.3.0", "currentReleaseId": null }

200 { "success": true, "data": { "updateAvailable": true, "release": {
        "id": "<update id>", "version": "", "runtimeVersion": "1.3.0", "mandatory": false,
        "message": "Fix crash", "groupId": "<shared by the android + ios updates>",
        "bundle": { "url": "https://firebasestorage.googleapis.com/…", "hash": "<sha256>", "size": 123456 },
        "signature": { "value": "<base64>", "keyId": "…", "algorithm": "rsa-v1_5-sha256" } } } }
200 { "success": true, "data": { "updateAvailable": false, "reason": "up_to_date" } }`;

const EVENTS_API = `POST /api/public/v1/updates/events
{ "app": "<appId>", "releaseId": "<id>", "platform": "android", "installationId": "<stable id>",
  "runtimeVersion": "1.3.0", "event": "install_succeeded", "eventId": "<unique per event>" }
# event: download_started | download_completed | install_succeeded | install_failed | rollback`;

const CI_API = `# Authorization: Bearer fota_sk_...
GET  /api/public/v1/me                            workspace, key role and apps behind the key
POST /api/public/v1/releases                      create a draft     (scope release.write, Idempotency-Key supported)
                                                  {"appId","platform","runtimeVersion","channel","releaseNotes","version?","groupId?"}
GET  /api/public/v1/releases?appId=…              list releases      (scope release.read)
POST /api/public/v1/releases/:id/bundle           upload .fota       (scope release.write, multipart "bundle", x-bundle-sha256,
                                                                      x-fireota-signature when the app uses code signing)
POST /api/public/v1/releases/:id/publish          {"action":"publish","rolloutPercentage":10}      (release.publish)
                                                  {"action":"pause"}                                (release.publish)
                                                  {"action":"rollback","reason":"…","targetReleaseId":"…"} (release.publish)
                                                  {"action":"rollout","rolloutPercentage":50}       (rollout.write)`;

const WEBHOOK_VERIFY = `import { createHmac, timingSafeEqual } from "node:crypto";

// x-fireota-signature: sha256=<hex>   x-fireota-timestamp: <unix seconds>
export function verify(rawBody, headers, secret) {
  const ts = headers["x-fireota-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window
  const expected = "sha256=" + createHmac("sha256", secret).update(\`\${ts}.\${rawBody}\`).digest("hex");
  const given = String(headers["x-fireota-signature"] ?? "");
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`;

const ENV = `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… (and the VITE_ copies)
SUPABASE_SERVICE_ROLE_KEY=…     # server only
FIREOTA_ENCRYPTION_KEY=…        # node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
FIREOTA_CRON_SECRET=…           # bearer token for the maintenance endpoint
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=https://ota.example.com/api/public/v1/firebase/callback`;

const CRON = `# every minute: retry failed webhook deliveries, prune expired OAuth states
curl -X POST https://ota.example.com/api/public/v1/internal/maintenance \\
  -H "Authorization: Bearer $FIREOTA_CRON_SECRET"`;

export const docGroups: DocGroup[] = [
  {
    title: "Get started",
    icon: "rocket_launch",
    pages: [
      {
        slug: "overview",
        title: "How FireOTA works",
        description: "Ship JavaScript fixes and features to your React Native app without waiting for a store review — from your own Firebase project.",
        sections: [
          {
            id: "demo",
            title: "Watch the demo",
            body: <ProductVideo />,
          },
          {
            id: "flow",
            title: "The update flow",
            body: (
              <>
              <p>
                A React Native app is two parts: <strong>native code</strong> (Java/Kotlin, Objective-C/Swift — compiled into the APK or
                IPA) and a <strong>JavaScript bundle</strong> that native code loads at start. FireOTA replaces only the JavaScript bundle,
                which is why fixes reach users in minutes instead of waiting for a store review.
              </p>
              <Figure caption="Who does what: you publish, FireOTA decides who gets the update, your Firebase Storage holds the file, devices download it directly.">
                <UpdateFlowDiagram />
              </Figure>
              <Steps
                items={[
                  <>You build an update package (JS bundle + images) and upload it. It is stored in <strong>your own Firebase Cloud Storage</strong> bucket.</>,
                  <>FireOTA records the release — version, runtime, checksum, channel, rollout — and writes every action to the audit log.</>,
                  <>On launch, the SDK asks FireOTA whether a compatible release exists for this device.</>,
                  <>The SDK downloads it straight from your bucket, verifies the SHA-256 checksum and applies it on the next start.</>,
                  <>If the new code crashes before starting, the device returns to the previous bundle automatically and reports it.</>,
                ]}
              />
              </>
            ),
          },
          {
            id: "terms",
            title: "Key terms",
            body: (
              <Bullets
                items={[
                  <><strong>Store build</strong> — the APK/AAB or IPA you upload to Google Play or the App Store. It contains the native code and a built-in JS bundle.</>,
                  <><strong>Update</strong> (also called release) — a new JS bundle plus images, packed as a <C>.fota</C> file. Every update has a unique ID and a message.</>,
                  <><strong>Runtime version</strong> — the label of a store build's native code, e.g. <C>1.0.0</C>. An update only goes to builds with exactly the same runtime. See <D to="runtime-versions">Runtime versions</D>.</>,
                  <><strong>Channel</strong> — a named stream such as <C>production</C> or <C>beta</C>. The app chooses its channel in the config; each channel serves one update per platform.</>,
                  <><strong>Rollout</strong> — the percentage of devices on a channel that receive the update.</>,
                  <><strong>App ID</strong> — the UUID that identifies your app in FireOTA. The SDK and the CLI both send it.</>,
                ]}
              />
            ),
          },
          {
            id: "can-change",
            title: "What an update can change",
            body: (
              <>
                <Bullets items={["Screens, components, navigation, business logic and styles", "Text, translations and images bundled through require()", "Bug fixes in any JavaScript or TypeScript code"]} />
                <Callout kind="caution">
                  OTA cannot change native code, native dependencies, permissions, the app icon, splash screen or anything in{" "}
                  <C>android/</C> and <C>ios/</C>. Those need a new store build with a new <D to="runtime-versions">runtime version</D>.
                  Updates must respect Apple and Google store policies — never change the app's primary purpose over the air.
                </Callout>
              </>
            ),
          },
          {
            id: "ownership",
            title: "You own the data",
            body: (
              <p>
                Bundles live in your bucket and devices download them directly, never through FireOTA. Google bills your Firebase
                project for storage and bandwidth; FireOTA does not charge per release, device or megabyte.
              </p>
            ),
          },
        ],
      },
      {
        slug: "before-you-begin",
        title: "Before you begin",
        description: "What you need in place before adding FireOTA to an app.",
        sections: [
          {
            id: "requirements",
            title: "Requirements",
            body: (
              <Bullets
                items={[
                  <>A <strong>bare React Native app, version 0.73 or newer</strong>, with <C>android/</C> and <C>ios/</C> folders.</>,
                  <>A <strong>Firebase project</strong> you own, and a Google account with Owner or Editor access to it.</>,
                  <>Node.js 18.17+ on the machine or CI runner that publishes updates.</>,
                  <>Hermes or JSC — both work. The CLI detects Hermes and compiles bytecode automatically.</>,
                  <>For Android builds: Android Studio (or a JDK 17+ and the Android SDK) so you can run <C>./gradlew</C>.</>,
                  <>For iOS builds: a <strong>Mac with Xcode</strong> and CocoaPods. iOS apps cannot be built on Windows or Linux.</>,
                  <>A real device or emulator for testing. OTA only runs in <strong>release</strong> builds; debug builds load JavaScript from Metro.</>,
                ]}
              />
            ),
          },
          {
            id: "values",
            title: "Values you will collect",
            body: (
              <>
                <p>Keep these at hand — they are used in several steps:</p>
                <Bullets
                  items={[
                    <><strong>Server URL</strong> — where your FireOTA dashboard runs, e.g. <C>https://ota.example.com</C>.</>,
                    <><strong>App ID</strong> — shown on the app page after you <D to="register-app">register the app</D>.</>,
                    <><strong>Android package name</strong> — <C>applicationId</C> in <C>android/app/build.gradle</C>, e.g. <C>com.fireota.test</C>.</>,
                    <><strong>iOS bundle identifier</strong> — Xcode → target → General → Bundle Identifier.</>,
                    <><strong>Store version</strong> — Android <C>versionName</C> / iOS Version (<C>MARKETING_VERSION</C>). This becomes the runtime version.</>,
                    <><strong>API key</strong> — created in <A to="/settings/api-keys">Settings → API keys</A>, used to publish.</>,
                  ]}
                />
              </>
            ),
          },
          {
            id: "expo",
            title: "Expo projects",
            body: (
              <Callout kind="note">
                Expo Go is not supported. Run <C>npx expo prebuild</C> to generate the native folders, then follow the bare React Native
                steps. Do not use FireOTA together with <C>expo-updates</C> — two update systems would fight over the bundle.
              </Callout>
            ),
          },
          {
            id: "status",
            title: "SDK status",
            body: (
              <Callout kind="important">
                The SDK (<C>@fireota/react-native</C>) and CLI (<C>@fireota/cli</C>) are in <strong>beta (0.x)</strong>: verified on
                Android with React Native 0.87; iOS is implemented but not yet device-tested. Test the full flow on a real device with a
                release build before relying on it in production.
              </Callout>
            ),
          },
        ],
      },
      {
        slug: "quickstart",
        title: "Quickstart",
        description: "The whole path from zero to your first over-the-air update, in order.",
        sections: [
          {
            id: "checklist",
            title: "Checklist",
            body: (
              <Steps
                items={[
                  <><D to="firebase-setup">Set up Cloud Storage</D> in your Firebase project.</>,
                  <><D to="workspace">Create your workspace</D> and connect the Firebase project.</>,
                  <><D to="register-app">Register your app</D> and copy its App ID.</>,
                  <><D to="install-sdk">Install the SDK</D> and wire it into <D to="android-setup">Android</D> and <D to="ios-setup">iOS</D>.</>,
                  <><D to="configure-sdk">Configure the SDK</D> at app start.</>,
                  <><D to="store-build">Ship a store build</D> that contains the SDK.</>,
                  <><D to="publish">Publish an update</D> to beta, test it, then <D to="rollouts">roll it out</D> to production.</>,
                  <><D to="ci">Automate publishing</D> from CI.</>,
                ]}
              />
            ),
          },
          {
            id: "time",
            title: "How long it takes",
            body: (
              <p>
                About 20–30 minutes for a first setup: 5 minutes in Firebase and the dashboard, 5 minutes for <C>fireota init</C>, and the
                rest for one release build of the app. After that, every update is a single <C>npx fireota publish</C>.
              </p>
            ),
          },
          {
            id: "first-test",
            title: "Your first end-to-end test",
            body: (
              <Steps
                items={[
                  <>Install a <strong>release</strong> build of the app on a device and open it once — this registers the device.</>,
                  <>Change something you can see, e.g. a text in <C>App.tsx</C>.</>,
                  <>Run <C>npx fireota publish</C> for that platform and the device's runtime and channel.</>,
                  <>Open the app, wait a few seconds for the “Update ready” card, tap <strong>Restart</strong> (or close and reopen the app).</>,
                  <>Your change appears. <D to="verify">Check an update worked</D> shows how to confirm it in the dashboard.</>,
                ]}
              />
            ),
          },
        ],
      },
    ],
  },
  {
    title: "Set up",
    icon: "settings",
    pages: [
      {
        slug: "firebase-setup",
        title: "Prepare your Firebase project",
        description: "Create the Cloud Storage bucket where your update packages will live.",
        sections: [
          {
            id: "storage",
            title: "Step 1. Enable Cloud Storage",
            body: (
              <>
              <p>FireOTA stores every update package in your project's default Cloud Storage bucket, so the bucket must exist first.</p>
              <Steps
                items={[
                  <>Open the <ExtLink href="https://console.firebase.google.com">Firebase console</ExtLink> and create or select a project.</>,
                  <>Go to <strong>Build → Storage → Get started</strong> and create the default bucket. Choose a location close to your users.</>,
                  <>New buckets (<C>&lt;project&gt;.firebasestorage.app</C>) require the <strong>Blaze</strong> (pay-as-you-go) plan.</>,
                  <>Pick <strong>Start in production mode</strong> when asked about rules — FireOTA does not need open rules (see step 2).</>,
                ]}
              />
              <Figure caption="Firebase console → Build → Storage. Click Get started; the bucket name appears once it is created.">
                <FirebaseStorageMock />
              </Figure>
              <Callout kind="tip">
                Use one Firebase project per environment if you want to keep test updates away from production, e.g.{" "}
                <C>my-app-dev</C> and <C>my-app</C>. Each FireOTA app is linked to exactly one Firebase project.
              </Callout>
              </>
            ),
          },
          {
            id: "cost",
            title: "What it costs",
            body: (
              <p>
                Google bills your project for stored bytes and downloads. An update package is usually 1–5 MB; each device downloads each
                update once. Blaze includes a free monthly quota for Cloud Storage, so test projects usually cost nothing.
              </p>
            ),
          },
          {
            id: "rules",
            title: "Step 2. Security rules",
            body: (
              <p>
                Your Storage rules can stay locked down. FireOTA writes with the Google authorization you grant it, and devices download
                through per-file tokenised links — no public bucket is needed.
              </p>
            ),
          },
          {
            id: "sdk",
            title: "Firebase SDK in the app",
            body: (
              <Callout kind="tip">
                You do not need to add the Firebase SDK, <C>google-services.json</C> or <C>GoogleService-Info.plist</C> to your React Native
                app for OTA updates. Devices only talk to your FireOTA server, which returns a tokenised download link to the bucket. Add
                Firebase to the app only if you use other Firebase products (Analytics, Crashlytics, …).
              </Callout>
            ),
          },
        ],
      },
      {
        slug: "workspace",
        title: "Create a workspace and connect Firebase",
        description: "Sign up, create your organization and authorize FireOTA to manage releases in your Firebase project.",
        sections: [
          {
            id: "account",
            title: "Step 1. Create your account",
            body: (
              <p>
                <A to="/signup">Sign up</A> with email or Google, confirm your email if asked, and finish onboarding to create your
                workspace. Invite teammates later from <A to="/team">Team</A>.
              </p>
            ),
          },
          {
            id: "connect",
            title: "Step 2. Connect the Firebase project",
            body: (
              <>
                <p>
                  FireOTA needs permission to write update packages into your bucket. It asks Google for it with OAuth — you never paste a
                  service-account key.
                </p>
                <Steps
                  items={[
                    <>Open <A to="/projects">Projects</A> and click <strong>Connect project</strong>.</>,
                    <><strong>Authorize a Google account</strong> — sign in with the account that owns the Firebase project and allow access. Google may warn that the app is unverified on self-hosted servers; choose <strong>Advanced → Continue</strong>.</>,
                    <><strong>Select a project</strong> — FireOTA lists the Firebase projects that account can see, with their storage bucket.</>,
                    <><strong>Verify the connection</strong> — FireOTA checks it can reach the project and write to Storage.</>,
                  ]}
                />
                <Figure caption="Projects → Connect project. The three steps run in order; the last one must show both checks in green.">
                  <ConnectFirebaseMock />
                </Figure>
                <Callout kind="note">
                  The Google refresh token is stored encrypted on the server. You can connect several projects (one per environment is
                  common) and disconnect any of them from the Projects page.
                </Callout>
              </>
            ),
          },
          {
            id: "verify",
            title: "Step 3. Check the connection",
            body: (
              <>
                <p>
                  Verification writes and deletes a tiny file (<C>fireota/.healthcheck</C>) to prove FireOTA can store packages. The card
                  must show <strong>Connected</strong> with <strong>Cloud Storage read/write</strong> ticked.
                </p>
                <Callout kind="caution">
                  Connecting a Google account does not grant permissions by itself. If Storage shows as not writable, give the account
                  Storage Admin (or Editor) on the project in Google Cloud IAM, then verify again.
                </Callout>
              </>
            ),
          },
        ],
      },
      {
        slug: "register-app",
        title: "Register your app",
        description: "Tell FireOTA about your React Native app, its platforms and its runtime version.",
        sections: [
          {
            id: "create",
            title: "Step 1. Add the application",
            body: (
              <>
                <Steps
                  items={[
                    <>Open <A to="/apps/new">Applications → Add application</A>.</>,
                    <><strong>Application name</strong> — any name your team recognises. The <strong>Slug</strong> is generated from it and can be used instead of the App ID in the CLI.</>,
                    <><strong>Destination project</strong> — the Firebase project whose bucket stores this app's updates.</>,
                    <><strong>Android package name</strong> / <strong>iOS bundle identifier</strong> — exactly as in your app. Leave one empty if you ship only one platform.</>,
                    <><strong>Runtime version</strong> — the <D to="runtime-versions">runtime version</D> of the build that is (or will be) in the stores, e.g. <C>1.0.0</C>.</>,
                  ]}
                />
                <Figure caption="Applications → Add application. The runtime version must equal the store version of your build, character for character.">
                  <AddAppMock />
                </Figure>
                <Callout kind="important">
                  The SDK reports the store version (Android <C>versionName</C>, iOS <C>CFBundleShortVersionString</C>) as its runtime by
                  default. A new React Native project starts at <C>1.0</C> on iOS, not <C>1.0.0</C>. If the dashboard says <C>1.0.0</C>, change
                  the app's version to <C>1.0.0</C> too, or devices will never match.
                </Callout>
              </>
            ),
          },
          {
            id: "channels",
            title: "Step 2. Channels",
            body: (
              <>
                <p>
                  Four channels are created: <C>production</C>, <C>beta</C>, <C>staging</C> and <C>development</C>. A device subscribes to one
                  channel (set in <C>configure()</C> or <C>fireota.config.js</C>) and receives the release currently published on it.
                  Android and iOS releases on the same channel are independent.
                </p>
                <Figure caption="The Channels page. “Serving” shows the update each channel currently delivers; new channels show “nothing yet”.">
                  <ChannelsMock />
                </Figure>
                <Bullets
                  items={[
                    <>A typical setup: internal testers' builds use <C>beta</C>, store builds use <C>production</C>.</>,
                    <>Use <strong>Promote</strong> on the Channels page to move a tested update from <C>beta</C> to <C>production</C> without rebuilding it.</>,
                    <>The workspace's <strong>default channel</strong> (Settings → Organization) is pre-selected when you create a release in the dashboard.</>,
                    <>The default channel of an app cannot be renamed or deleted.</>,
                  ]}
                />
              </>
            ),
          },
          {
            id: "app-id",
            title: "Step 3. Copy the App ID",
            body: (
              <>
                <p>Open the app in the dashboard and copy its <strong>App ID</strong> — the SDK and the CLI both need it.</p>
                <Figure caption="The app page. Copy the App ID with the copy icon; it is a UUID and never changes.">
                  <AppIdMock />
                </Figure>
              </>
            ),
          },
        ],
      },
    ],
  },
  {
    title: "Integrate the SDK",
    icon: "integration_instructions",
    pages: [
      {
        slug: "install-sdk",
        title: "Install the SDK",
        description: "Add the FireOTA SDK and CLI to your React Native project.",
        sections: [
          {
            id: "install",
            title: "Install and set up in two commands",
            body: (
              <>
                <Code
                  code={`npm install @fireota/react-native && npm install --save-dev @fireota/cli
npx fireota init --app YOUR_APP_ID --server-url https://ota.example.com
cd ios && pod install && cd ..   # iOS only`}
                />
                <p>
                  <C>fireota init</C> creates <C>fireota.config.js</C>, wraps your root component with <C>withFireOTA()</C>{" "}
                  (update check on launch + a ready-made “Restart to update” prompt), wires <C>MainApplication</C> and{" "}
                  <C>AppDelegate</C> for release builds, adds an <C>ota:publish</C> script and updates <C>.gitignore</C>. It never
                  overwrites anything and lists every change; <C>--dry-run</C> previews them. Rebuild the app once and you are done —
                  the Android, iOS and Configure pages are only needed for manual setups.
                </p>
                <p>Run the commands from the project root (the folder with <C>package.json</C>). The output looks like this:</p>
                <Figure caption="fireota init output. ✓ = changed, – = already done and left alone, ! = needs a manual change (follow the linked setup page).">
                  <TerminalFrame lines={INIT_OUTPUT} />
                </Figure>
                <Callout kind="caution">
                  On the React Native 0.88+ template, iOS's <C>bundleURL()</C> lives in <C>SceneDelegate.swift</C>, not{" "}
                  <C>AppDelegate</C>. If <C>init</C> prints a <strong>!</strong> for iOS, finish it by hand on the{" "}
                  <D to="ios-setup">iOS setup</D> page.
                </Callout>
              </>
            ),
          },
          {
            id: "files",
            title: "What init changes",
            body: (
              <>
                <ProjectTreeMock
                  items={[
                    { path: "fireota.config.js", note: "App ID, server URL, channel, install modes" },
                    { path: "index.js", note: "registers withFireOTA(App, fireotaConfig)" },
                    { path: "android/…/MainApplication.kt", note: "release builds load FireOTA.getJSBundleFile()" },
                    { path: "ios/<App>/AppDelegate.swift", note: "release builds return FireOTA.bundleURL()" },
                    { path: "package.json", note: 'adds "ota:publish": "fireota publish --platform all"' },
                    { path: ".gitignore", note: "ignores *.fota and the signing private key" },
                  ]}
                />
                <p>The generated config and entry point:</p>
                <Code language="js" code={CONFIG_FILE} />
                <Callout kind="note">
                  <C>fireota.config.js</C> has no secrets and should be committed. Change <C>channel</C> there (e.g. to <C>beta</C>) for
                  test builds. The runtime version is read from the store version unless you add <C>runtimeVersion</C> to it.
                </Callout>
              </>
            ),
          },
          {
            id: "rebuild",
            title: "Rebuild the app",
            body: (
              <>
                <p>The SDK contains native code, so the app must be rebuilt once (Metro reload is not enough):</p>
                <Code
                  code={`# Android — release build on a connected device
npx react-native run-android --mode release

# iOS (on a Mac)
cd ios && pod install && cd ..
npx react-native run-ios --mode Release`}
                />
              </>
            ),
          },
          {
            id: "ui",
            title: "Built-in update UI",
            body: (
              <>
              <Figure caption="What users see. Left: the prompt after a normal update downloads (Later hides it until the next update). Middle: a mandatory update installing. Right: the optional <UpdateScreen /> for your settings.">
                <UpdatePromptMocks />
              </Figure>
              <Bullets
                items={[
                  <><C>&lt;UpdatePrompt /&gt;</C> — shown automatically: “Restart to update” card, full-screen notice for mandatory updates.</>,
                  <><C>&lt;UpdateScreen /&gt;</C> — a complete “App updates” screen (version, runtime, channel, check / download / restart).</>,
                  <><C>useFireOTA()</C> — state plus <C>check()</C>, <C>install()</C>, <C>restart()</C> to build your own UI.</>,
                  <>Restyle with <C>theme</C>, replace the prompt with <C>renderPrompt</C>, or hide it with <C>prompt={"{false}"}</C> — step by step in <D to="customize-ui">Customize the update prompt</D>.</>,
                ]}
              />
              <Code
                language="tsx"
                code={`import { UpdateScreen, useFireOTA } from "@fireota/react-native";

// 1. A full screen in your settings stack
<Stack.Screen name="Updates" component={UpdateScreen} />

// 2. Or your own UI
function UpdateBadge() {
  const { status, available, check, install, restart } = useFireOTA();
  if (status === "installed") return <Button title="Restart to update" onPress={restart} />;
  if (available) return <Button title="Download update" onPress={install} />;
  return <Button title="Check for updates" onPress={check} />;
}`}
              />
              </>
            ),
          },
          {
            id: "linking",
            title: "Linking",
            body: (
              <p>
                The SDK is autolinked. On Android it adds the INTERNET permission and a small restart activity to your manifest. On iOS it
                links only system libraries (CommonCrypto, zlib) — no third-party dependencies.
              </p>
            ),
          },
        ],
      },
      {
        slug: "customize-ui",
        title: "Customize the update prompt",
        description: "Change the colours and text of the built-in prompt, replace it with your own design, or build a fully custom update flow.",
        sections: [
          {
            id: "choose",
            title: "Pick the level of control you need",
            body: (
              <>
                <p>
                  The prompt is ordinary React Native UI from <C>@fireota/react-native</C>. Customizing it never touches native code, so
                  every change below can itself ship as an OTA update — no store build needed.
                </p>
                <Bullets
                  items={[
                    <><a href="#theme" className="text-brand underline-offset-2 hover:underline">Colours only</a> — pass a <C>theme</C>. One line, keeps the built-in layout.</>,
                    <><a href="#text" className="text-brand underline-offset-2 hover:underline">Colours and wording</a> — render <C>&lt;UpdatePrompt title message /&gt;</C> yourself.</>,
                    <><a href="#render-prompt" className="text-brand underline-offset-2 hover:underline">Your own design</a> — <C>renderPrompt</C> on <C>FireOTAProvider</C>. Full control over the look; FireOTA still decides when it shows.</>,
                    <><a href="#hook" className="text-brand underline-offset-2 hover:underline">Your own screens</a> — <C>useFireOTA()</C> anywhere in the app, e.g. a Settings row.</>,
                    <><a href="#manual" className="text-brand underline-offset-2 hover:underline">Your own timing</a> — <C>checkOnAppStart: false</C> and the imperative API.</>,
                  ]}
                />
              </>
            ),
          },
          {
            id: "default",
            title: "What the built-in prompt does",
            body: (
              <>
                <Figure caption="The built-in UI with the default theme: the prompt after a download, the mandatory-update screen, and <UpdateScreen />.">
                  <UpdatePromptMocks />
                </Figure>
                <Bullets
                  items={[
                    <>A card appears at the bottom once a normal update is <strong>downloaded</strong> (status <C>installed</C>). It shows the update's <C>--message</C>.</>,
                    <><strong>Restart</strong> applies it now; <strong>Later</strong> hides the card for that update — it still applies on the next cold start.</>,
                    <>For a <strong>mandatory</strong> update a full-screen “Installing an important update” notice blocks the app while it downloads, then the app restarts.</>,
                    <>Nothing is shown when there is no update, while checking, or after an error.</>,
                  ]}
                />
              </>
            ),
          },
          {
            id: "theme",
            title: "Option 1. Change the colours",
            body: (
              <>
                <p>
                  Pass a <C>theme</C> as the third argument of <C>withFireOTA</C> in <C>index.js</C>. Every key is optional; missing keys
                  keep the default. The same theme also styles <C>&lt;UpdateScreen /&gt;</C>.
                </p>
                <Code language="js" code={UI_THEME} />
                <Figure caption="Left: default theme. Middle: the theme above. Right: the same theme with custom text (option 2).">
                  <ThemeCompareMock />
                </Figure>
                <p>Default values, for reference:</p>
                <Code
                  language="ts"
                  code={`accent: "#FF5A1F"   background: "#0E1013"   card: "#171A1F"
text:   "#F4F5F7"   muted:      "#9AA1AC"   danger: "#F05252"`}
                />
                <Callout kind="tip">
                  Want light and dark versions? Compute the theme from <C>Appearance.getColorScheme()</C> before calling{" "}
                  <C>withFireOTA</C>, or use option 3 with <C>useColorScheme()</C> inside your component to follow live changes.
                </Callout>
              </>
            ),
          },
          {
            id: "text",
            title: "Option 2. Change the title and message",
            body: (
              <>
                <p>
                  <C>&lt;UpdatePrompt /&gt;</C> takes <C>title</C> (default “Update ready”) and <C>message</C> (default: the update's
                  message, or “A new version is ready. Restart to use it.”). Turn the automatic prompt off with{" "}
                  <C>{"{ prompt: false }"}</C> and place your own instance — otherwise two prompts appear.
                </p>
                <Code language="tsx" code={UI_TEXT} />
                <Callout kind="note">
                  Render <C>&lt;UpdatePrompt /&gt;</C> after your navigator so it draws on top of the screens. It positions itself at the
                  bottom and handles mandatory updates the same way as the built-in one.
                </Callout>
              </>
            ),
          },
          {
            id: "render-prompt",
            title: "Option 3. Replace it with your own design",
            body: (
              <>
                <p>
                  <C>renderPrompt</C> replaces the built-in prompt with any component you like. FireOTA calls it on every state change
                  with the current update state and the actions, and renders whatever you return on top of the app (return{" "}
                  <C>null</C> to show nothing).
                </p>
                <Callout kind="important">
                  <C>withFireOTA</C> only accepts <C>prompt</C> and <C>theme</C>. To use <C>renderPrompt</C>, replace{" "}
                  <C>withFireOTA(App, fireotaConfig)</C> in <C>index.js</C> with a small <C>Root</C> component that wraps the app in{" "}
                  <C>FireOTAProvider</C>, as below. Behaviour is otherwise identical.
                </Callout>
                <Steps
                  items={[
                    <>
                      Change <C>index.js</C>:
                      <Code language="tsx" code={UI_RENDER_PROMPT} />
                    </>,
                    <>
                      Create the component. This example shows a green bar at the top for normal updates and keeps a blocking screen for
                      mandatory ones:
                      <Code language="tsx" code={UI_BANNER} />
                    </>,
                    <>Build a release build, publish an update and open the app twice to see the new prompt.</>,
                  ]}
                />
                <Figure caption="Two prompts built with renderPrompt: a top bar, and a dialog that lists the release notes.">
                  <CustomPromptMock />
                </Figure>
                <Callout kind="caution">
                  When you replace the prompt you also replace the mandatory-update screen. Always handle{" "}
                  <C>available?.mandatory</C> as in the example, or users may keep using the app until the forced restart happens.
                </Callout>
              </>
            ),
          },
          {
            id: "state",
            title: "What renderPrompt and useFireOTA() receive",
            body: (
              <>
                <Bullets
                  items={[
                    <><C>status</C> — <C>idle</C>, <C>checking</C>, <C>upToDate</C>, <C>downloading</C>, <C>downloaded</C>, <C>installed</C> (ready, waiting for a restart) or <C>error</C>.</>,
                    <><C>available</C> — the update found by the last check: <C>id</C>, <C>message</C>, <C>notes</C>, <C>mandatory</C>, <C>runtimeVersion</C>, <C>version</C> (optional label). <C>null</C> when there is none.</>,
                    <><C>pendingReleaseId</C> — downloaded and waiting for a restart. <C>currentReleaseId</C> — the update running now, <C>null</C> for the store build.</>,
                    <><C>runtimeVersion</C>, <C>channel</C>, <C>appVersion</C>, <C>lastCheckedAt</C>, <C>error</C>, <C>configured</C>.</>,
                    <>Actions: <C>check()</C>, <C>install()</C> (download + verify, applies on next start), <C>restart()</C>. <C>busy</C> is true while one runs; <C>actionError</C> holds its last error.</>,
                    <><C>theme</C> — the merged theme, so your component can reuse the colours you passed.</>,
                  ]}
                />
                <p>
                  A normal update is ready to show when <C>status === "installed"</C> and <C>pendingReleaseId</C> differs from{" "}
                  <C>currentReleaseId</C> — that is exactly the condition the built-in prompt uses.
                </p>
              </>
            ),
          },
          {
            id: "hook",
            title: "Option 4. Show update state in your own screens",
            body: (
              <>
                <p>
                  <C>useFireOTA()</C> works in any component under <C>withFireOTA</C> or <C>FireOTAProvider</C>. Use it for a Settings row,
                  a badge on a tab, or an “About” screen. Keep the built-in prompt or hide it with <C>{"{ prompt: false }"}</C>.
                </p>
                <Code language="tsx" code={UI_HOOK} />
                <p>
                  Prefer a ready-made screen? <C>&lt;UpdateScreen title footer /&gt;</C> shows version, runtime, channel, status and the
                  right button, styled with your theme:
                </p>
                <Code language="tsx" code={`<Stack.Screen name="Updates" component={UpdateScreen} />`} />
              </>
            ),
          },
          {
            id: "manual",
            title: "Option 5. Decide when to check",
            body: (
              <>
                <p>
                  By default the SDK checks and downloads on every launch. To check at a moment you choose — after login, on a button, or
                  only on Wi-Fi — turn that off and drive it yourself:
                </p>
                <Code language="js" code={UI_MANUAL_FLOW} />
                <Callout kind="note">
                  The launch confirmation still happens automatically: <C>configure()</C> runs at start even with{" "}
                  <C>checkOnAppStart: false</C>, so a broken update is still rolled back.
                </Callout>
              </>
            ),
          },
          {
            id: "test",
            title: "Testing your prompt",
            body: (
              <Steps
                items={[
                  <>Install a <strong>release</strong> build that contains your prompt code (or publish the prompt itself as an update first).</>,
                  <>Publish a small change with a clear message: <C>npx fireota publish … --message "Testing the new prompt"</C>.</>,
                  <>Open the app and wait a few seconds — your prompt should appear once the download finishes.</>,
                  <>To test the mandatory path, publish again with <C>--mandatory</C>.</>,
                  <>Use the <strong>beta</strong> channel for these tests so production users never see them.</>,
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: "android-setup",
        title: "Android setup",
        description: "Load the latest verified OTA bundle in Android release builds.",
        sections: [
          {
            id: "bundle-file",
            title: "Point React Native at the OTA bundle",
            body: (
              <>
              <p>
                By default a release build loads the JS bundle packed inside the APK. This change makes it load the latest verified OTA
                bundle instead, falling back to the packed one when there is none. Debug builds are untouched and keep using Metro.
              </p>
              <p>
                Open <C>android/app/src/main/java/&lt;your/package&gt;/MainApplication.kt</C> (the folder matches your package name,
                e.g. <C>com/fireota/test/</C>) and apply the snippet that matches your file:
              </p>
              <PlatformTabs
                tabs={[
                  { value: "host", label: "RN 0.76+ (ReactHost)", icon: "new_releases", content: <Code language="kotlin" code={ANDROID_HOST} /> },
                  { value: "kotlin", label: "Older, Kotlin", icon: "code", content: <Code language="kotlin" code={ANDROID_KOTLIN} /> },
                  { value: "java", label: "Older, Java", icon: "code", content: <Code language="java" code={ANDROID_JAVA} /> },
                ]}
              />
              </>
            ),
          },
          {
            id: "version",
            title: "Check the version name",
            body: (
              <>
                <p>
                  The SDK uses <C>versionName</C> from <C>android/app/build.gradle</C> as the runtime version. It must equal the runtime
                  version set in the dashboard:
                </p>
                <Code
                  language="groovy"
                  code={`android {
    defaultConfig {
        applicationId "com.fireota.test"
        versionCode 1
        versionName "1.0.0"   // = runtime version in the dashboard
    }
}`}
                />
              </>
            ),
          },
          {
            id: "build-test",
            title: "Build and test",
            body: (
              <Steps
                items={[
                  <>Build a release APK on a device: <C>npx react-native run-android --mode release</C> (or <C>cd android && ./gradlew assembleRelease</C>).</>,
                  <>Open the app once. An <C>update_check</C> event appears in <A to="/analytics">Analytics</A> and the runtime shows on the app's <strong>Runtimes</strong> tab.</>,
                  <>After changing the package name or adding native libraries, run <C>cd android && ./gradlew clean</C> first.</>,
                ]}
              />
            ),
          },
          {
            id: "which",
            title: "Which snippet do I need?",
            body: (
              <p>
                If your <C>MainApplication</C> calls <C>getDefaultReactHost(context, packageList, …)</C> — the default since React Native
                0.76 — use the first tab (verified on 0.87). Projects that still override <C>reactNativeHost</C> use the Kotlin or Java tab.
              </p>
            ),
          },
          {
            id: "how",
            title: "What happens at launch",
            body: (
              <Bullets
                items={[
                  "A pending update is promoted and must confirm the launch by reaching FireOTA.configure().",
                  "A bundle that reaches a second launch without confirming is rolled back to the previous one.",
                  "Installing a new APK/AAB from the store discards every older OTA bundle automatically.",
                  "Applying an update immediately performs a cold restart of the app process.",
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: "ios-setup",
        title: "iOS setup",
        description: "Load the latest verified OTA bundle in iOS release builds.",
        sections: [
          {
            id: "requirements",
            title: "Before you start",
            body: (
              <Bullets
                items={[
                  <>A <strong>Mac with Xcode</strong> and CocoaPods (<C>sudo gem install cocoapods</C> or <C>brew install cocoapods</C>).</>,
                  <>The SDK installed (<C>npm install @fireota/react-native</C>) and <C>fireota init</C> run — or the JS side wired by hand as in <D to="configure-sdk">Configure the SDK</D>.</>,
                  <>Your Apple team selected under Xcode → target → <strong>Signing &amp; Capabilities</strong> to run on a real device.</>,
                ]}
              />
            ),
          },
          {
            id: "pods",
            title: "Step 1. Install the pod",
            body: (
              <>
                <Code code={`cd ios && pod install && cd ..`} />
                <p>
                  Autolinking adds the <C>fireota-react-native</C> pod. Always open <C>ios/&lt;App&gt;.xcworkspace</C> in Xcode from now on,
                  not the <C>.xcodeproj</C>.
                </p>
              </>
            ),
          },
          {
            id: "bridging",
            title: "Step 2. Swift projects: add a bridging header",
            body: (
              <>
                <p>
                  The SDK's native part is Objective-C. Swift code can only call it through a bridging header. Skip this step for
                  Objective-C (<C>AppDelegate.mm</C>) projects.
                </p>
                <Steps
                  items={[
                    <>In Xcode choose <strong>File → New → File… → Header File</strong>, name it <C>&lt;App&gt;-Bridging-Header.h</C> and save it in the <C>ios/&lt;App&gt;/</C> folder, target ticked.</>,
                    <>Put this line in it:<Code language="objc" code={IOS_BRIDGING} /></>,
                    <>Select the target → <strong>Build Settings</strong> → search “bridging” → set <strong>Objective-C Bridging Header</strong> to <C>&lt;App&gt;/&lt;App&gt;-Bridging-Header.h</C> for Debug and Release.</>,
                  ]}
                />
                <Figure caption="Xcode → target → Build Settings → Swift Compiler – General. The path is relative to the ios/ folder.">
                  <XcodeBridgingMock />
                </Figure>
                <Callout kind="tip">
                  If the project already has a bridging header (Xcode offers one when you add an Objective-C file), add the import to that
                  file instead of creating a second one.
                </Callout>
              </>
            ),
          },
          {
            id: "bundle-url",
            title: "Step 3. Point React Native at the OTA bundle",
            body: (
              <>
                <p>
                  Find the <C>bundleURL()</C> function of your template and make release builds return <C>FireOTA.bundleURL()</C>. It
                  returns the latest verified OTA bundle, or <C>nil</C> when there is none — then the bundle inside the app is used.
                </p>
                <PlatformTabs
                  tabs={[
                    { value: "scene", label: "RN 0.88+ (SceneDelegate)", icon: "new_releases", content: <Code language="swift" code={IOS_SCENE} /> },
                    { value: "swift", label: "RN 0.77–0.87 (Swift)", icon: "code", content: <Code language="swift" code={IOS_SWIFT} /> },
                    { value: "objc", label: "Objective-C", icon: "code", content: <Code language="objc" code={IOS_OBJC} /> },
                  ]}
                />
                <Callout kind="note">
                  Not sure which file? Search the <C>ios/</C> folder for <C>bundleURL</C> — edit the one that returns{" "}
                  <C>main.jsbundle</C>.
                </Callout>
              </>
            ),
          },
          {
            id: "version",
            title: "Step 4. Check the version",
            body: (
              <>
                <p>
                  The SDK uses the app's <strong>Version</strong> (<C>CFBundleShortVersionString</C>, set by <C>MARKETING_VERSION</C>) as
                  the runtime version. New projects start at <C>1.0</C>. In Xcode → target → <strong>General</strong> → Identity, set
                  Version to exactly the runtime version from the dashboard, e.g. <C>1.0.0</C>.
                </p>
                <Figure caption="An update reaches a device only when the runtime versions match exactly.">
                  <RuntimeMatchDiagram />
                </Figure>
              </>
            ),
          },
          {
            id: "build-test",
            title: "Step 5. Build and test",
            body: (
              <Steps
                items={[
                  <>Build a release build: <C>npx react-native run-ios --mode Release</C>, or in Xcode <strong>Product → Scheme → Edit Scheme → Run → Build Configuration: Release</strong>, then Run.</>,
                  <>Open the app once — it registers with FireOTA and appears on the app's <strong>Runtimes</strong> tab.</>,
                  <>Publish: <C>npx fireota publish --app YOUR_APP_ID --platform ios --runtime 1.0.0 --channel production --message "iOS test"</C>.</>,
                  <>Open the app, wait for “Update ready”, tap <strong>Restart</strong>.</>,
                ]}
              />
            ),
          },
          {
            id: "storage",
            title: "Where updates are stored",
            body: (
              <p>
                Packages are kept in Application Support, excluded from iCloud backup. A new App Store or TestFlight build clears them, and
                immediate installs reload JavaScript in place.
              </p>
            ),
          },
        ],
      },
      {
        slug: "configure-sdk",
        title: "Configure the SDK",
        description: "Initialize FireOTA once, as early as possible in your JavaScript entry point.",
        sections: [
          {
            id: "configure",
            title: "Call configure()",
            body: (
              <>
                <p>
                  If you used <C>fireota init</C>, this is already done: <C>withFireOTA(App, fireotaConfig)</C> calls{" "}
                  <C>configure()</C> for you. For a manual setup, call it in <C>index.js</C> before registering the root component:
                </p>
                <Code language="js" code={CONFIGURE} />
              </>
            ),
          },
          {
            id: "confirmation",
            title: "Launch confirmation",
            body: (
              <>
                <p>Every new bundle goes through these states on the device:</p>
                <Figure caption="An update's life on a device. Reaching configure() is the proof that the new JavaScript starts.">
                  <LaunchLifecycleDiagram />
                </Figure>
                <Callout kind="important">
                  Call <C>configure()</C> early and unconditionally. Reaching it is how a new bundle proves it starts; a bundle that never
                  reaches it is rolled back on the next launch. Do not put it behind a login, a feature flag or an <C>await</C> that can fail.
                </Callout>
              </>
            ),
          },
          {
            id: "install-modes",
            title: "When updates are applied",
            body: (
              <Bullets
                items={[
                  <><C>nextRestart</C> (default) — the update downloads in the background and runs the next time the app starts from scratch. The built-in prompt offers <strong>Restart</strong> to apply it now.</>,
                  <><C>immediate</C> — the app restarts as soon as the download is verified. Used by default for updates published with <C>--mandatory</C>.</>,
                  <>A cold start means the app was swiped away (or killed by the OS). Sending it to the background and back is not a restart.</>,
                ]}
              />
            ),
          },
          {
            id: "options",
            title: "Options",
            body: (
              <Bullets
                items={[
                  <><C>appId</C>, <C>serverUrl</C>, <C>runtimeVersion</C> — required.</>,
                  <><C>channel</C> — default <C>production</C>.</>,
                  <><C>checkOnAppStart</C> — default <C>true</C>; set <C>false</C> and call <C>FireOTA.sync()</C> yourself to control timing.</>,
                  <><C>installMode</C> / <C>mandatoryInstallMode</C> — <C>nextRestart</C> or <C>immediate</C>.</>,
                  <><C>onStatusChange(status, detail)</C> — show progress or errors in your UI.</>,
                ]}
              />
            ),
          },
        ],
      },
    ],
  },
  {
    title: "Release",
    icon: "send",
    pages: [
      {
        slug: "store-build",
        title: "Ship the store build",
        description: "Only binaries that contain the SDK can receive updates.",
        sections: [
          {
            id: "build",
            title: "Build and submit",
            body: (
              <>
                <p>
                  Build a release (<C>./gradlew bundleRelease</C> / Xcode Archive) and submit it as usual. Its runtime version must match the
                  value in <C>configure()</C> and in the dashboard.
                </p>
                <Steps
                  items={[
                    <>Set the store version: Android <C>versionName</C>, iOS Version. Bump <C>versionCode</C> / Build as the stores require.</>,
                    <>Make sure the app in the dashboard has the same runtime version (app page → settings), or set it when you register the app.</>,
                    <>Android: <C>cd android && ./gradlew bundleRelease</C> → upload <C>app/build/outputs/bundle/release/app-release.aab</C> to Play Console.</>,
                    <>iOS: Xcode → <strong>Product → Archive</strong> → <strong>Distribute App</strong> → App Store Connect / TestFlight.</>,
                  ]}
                />
                <Callout kind="tip">
                  Test with an internal track (Play internal testing, TestFlight) on the <C>beta</C> channel before the public release.
                </Callout>
              </>
            ),
          },
          {
            id: "native-changes",
            title: "When native code changes",
            body: (
              <Callout kind="caution">
                Any change to native code or native dependencies needs a new store build <strong>and</strong> a new runtime version.
                Publishing JavaScript that expects the new native code to older binaries would crash them.
              </Callout>
            ),
          },
        ],
      },
      {
        slug: "publish",
        title: "Publish an update",
        description: "Build the update package, upload it to your Firebase Storage and publish it to a channel.",
        sections: [
          {
            id: "api-key",
            title: "Step 1. Create an API key",
            body: (
              <>
                <p>
                  In <A to="/settings/api-keys">Settings → API keys</A>, create a key with <C>release.write</C> and <C>release.publish</C>.
                  The full key is shown once — store it as a secret. Only owners and admins can create keys.
                </p>
                <Figure caption="Settings → API keys → Create key. Give it a name that says where it is used, so you know which one to revoke later.">
                  <ApiKeyMock />
                </Figure>
              </>
            ),
          },
          {
            id: "one-command",
            title: "Step 2. Publish with one command",
            body: (
              <>
                <Code code={PUBLISH} />
                <p>
                  <C>fireota publish</C> runs React Native's bundler, compiles Hermes bytecode when Hermes is on, packs the images next to
                  the bundle, creates the release, uploads it with a checksum, and publishes it.
                </p>
                <Figure caption="A successful publish. The SHA-256 printed by the CLI and the one verified in your Firebase Storage must match.">
                  <TerminalFrame lines={PUBLISH_OUTPUT} />
                </Figure>
                <p>The flags you will use most:</p>
                <Bullets
                  items={[
                    <><C>--platform android|ios|all</C> — <C>all</C> builds both bundles (needs a Mac for iOS) and groups them as one update.</>,
                    <><C>--runtime</C> — must equal the store build's runtime version. Omit it and the CLI reads the store version (<C>versionName</C> / iOS Version) from the project.</>,
                    <><C>--channel</C> — which channel gets the update (default <C>production</C>).</>,
                    <><C>--rollout</C> — percentage of devices on that channel, default 100.</>,
                    <><C>--message</C> — what changed; shown in the dashboard and the in-app prompt.</>,
                    <><C>--mandatory</C> — devices install it immediately and restart.</>,
                  ]}
                />
                <Callout kind="note">
                  On Windows, set the variables with <C>$env:FIREOTA_URL="…"</C> (PowerShell) or <C>set FIREOTA_URL=…</C> (cmd) instead of{" "}
                  <C>export</C>.
                </Callout>
              </>
            ),
          },
          {
            id: "step-by-step",
            title: "Step by step",
            body: <Code code={MANUAL} />,
          },
          {
            id: "dashboard",
            title: "From the dashboard",
            body: (
              <p>
                Open your app → <strong>Create release</strong>, upload a <C>.fota</C> package built with <C>npx fireota bundle</C>, choose
                platform, channel, version and rollout, then publish.
              </p>
            ),
          },
          {
            id: "best-practice",
            title: "Recommended flow",
            body: <Callout kind="tip">Publish to <C>beta</C> or <C>staging</C> first, test on a device, then publish to <C>production</C> at a small percentage.</Callout>,
          },
        ],
      },
      {
        slug: "rollouts",
        title: "Rollouts, pause and rollback",
        description: "Release gradually and recover quickly when something goes wrong.",
        sections: [
          {
            id: "staged",
            title: "Staged rollout",
            body: (
              <>
                <p>
                  Start at 1–10%. Each device gets a stable bucket from its installation ID, so raising the percentage only adds devices — no
                  device flips back and forth.
                </p>
                <Figure caption="A 10% rollout: 10 of the 100 buckets receive the update.">
                  <RolloutBucketsDiagram percent={10} />
                </Figure>
                <p>
                  A common schedule: 10% → watch failures for a few hours → 50% → 100%. Change the percentage from the release page, the
                  Rollouts page or the CLI.
                </p>
              </>
            ),
          },
          {
            id: "pause",
            title: "Pause",
            body: <p>Stops offering the release to devices that do not have it yet. Devices that installed it keep it.</p>,
          },
          {
            id: "rollback",
            title: "Roll back",
            body: (
              <p>
                Requires a reason. The channel returns to the previous release (or one you choose with the same runtime) and devices move
                to it on their next check. Release files are never deleted by a rollback.
              </p>
            ),
          },
          {
            id: "auto-pause",
            title: "Automatic pause",
            body: (
              <p>
                Once at least 25 devices have reported an install outcome and the failure rate passes the rollout's threshold (2% by
                default), the release pauses itself and your team is notified.
              </p>
            ),
          },
          {
            id: "cli",
            title: "From the CLI",
            body: (
              <Code
                code={`npx fireota release rollout  <releaseId> --percentage 50
npx fireota release pause    <releaseId>
npx fireota release rollback <releaseId> --reason "Crash on launch on Android 14"`}
              />
            ),
          },
        ],
      },
      {
        slug: "ci",
        title: "Automate with CI",
        description: "Publish an update on every merge.",
        sections: [
          {
            id: "any-ci",
            title: "Any CI tool",
            body: (
              <>
                <p>
                  The CLI is the same everywhere. It detects commit, branch and build number on GitHub Actions, GitLab CI, Bitbucket
                  Pipelines, Jenkins, Azure DevOps, CircleCI, Bitrise, Buildkite, Travis, TeamCity, Codemagic and AWS CodeBuild (or set{" "}
                  <C>FIREOTA_GIT_SHA</C>, <C>FIREOTA_GIT_BRANCH</C>, <C>FIREOTA_BUILD_NUMBER</C>). Ready-made pipeline files for each tool
                  are in the dashboard under <A to="/settings/ci-cd">CI/CD</A>.
                </p>
                <Code code={ANY_CI} />
              </>
            ),
          },
          {
            id: "github",
            title: "GitHub Actions",
            body: <Code language="yaml" code={GITHUB} />,
          },
          {
            id: "retries",
            title: "Safe retries and output",
            body: (
              <p>
                The CLI sends an idempotency key derived from the inputs, so a retried job never creates a duplicate update and skips
                steps that already finished. It exits with code 1 on any error; <C>--json</C> prints a machine-readable result.
              </p>
            ),
          },
        ],
      },
      {
        slug: "verify",
        title: "Check an update worked",
        description: "Confirm devices received and started the new code.",
        sections: [
          {
            id: "device",
            title: "On a device",
            body: (
              <>
                <Steps
                  items={[
                    <>Open a release build of the app — an <C>update_check</C> event appears in <A to="/analytics">Analytics</A>.</>,
                    <>After publishing, open the app, wait a few seconds, close it fully and reopen it.</>,
                    <><C>download_completed</C> and <C>install_succeeded</C> events confirm the update is running.</>,
                  ]}
                />
                <Figure caption="Analytics events of one device receiving an update, oldest first. Stuck after update_check? See Troubleshooting.">
                  <AnalyticsEventsMock />
                </Figure>
              </>
            ),
          },
          {
            id: "runtimes",
            title: "On the Runtimes tab",
            body: (
              <>
                <p>
                  The app page's <strong>Runtimes</strong> tab groups devices and updates by runtime version. If your device shows up under
                  a different runtime than your update (e.g. <C>1.0</C> instead of <C>1.0.0</C>), the versions do not match and the
                  device will not receive it.
                </p>
                <Figure caption="Runtimes tab. Here one device still runs runtime 1.0, so it cannot receive updates published for 1.0.0.">
                  <RuntimesMock />
                </Figure>
                <p>
                  The list is built from the app's runtime, its platforms, published updates and the runtimes devices report. Entries
                  from old test builds disappear only when those device records are removed.
                </p>
              </>
            ),
          },
          {
            id: "in-app",
            title: "In the app",
            body: <p>Show <C>(await FireOTA.getCurrentRelease()).releaseId</C> on an About screen to see which release is running.</p>,
          },
        ],
      },
    ],
  },
  {
    title: "Concepts",
    icon: "school",
    pages: [
      {
        slug: "runtime-versions",
        title: "Runtime versions",
        description: "How FireOTA keeps JavaScript and native code compatible.",
        sections: [
          {
            id: "what",
            title: "What a runtime version is",
            body: (
              <>
                <p>
                  A runtime version names a set of native code — one store build (Play Store / App Store). A bundle runs only on binaries
                  with <strong>exactly</strong> the same runtime version — the server and the SDK both enforce it, because JavaScript that
                  calls missing native code crashes.
                </p>
                <Figure caption="Matching is exact text comparison, not semantic versioning.">
                  <RuntimeMatchDiagram />
                </Figure>
                <p>Three places must agree on the value:</p>
                <Bullets
                  items={[
                    <>The <strong>app</strong> — store version (<C>versionName</C> / <C>CFBundleShortVersionString</C>), or <C>runtimeVersion</C> in the config if you set it.</>,
                    <>The <strong>dashboard</strong> — the app's runtime version (shown as “current store build”).</>,
                    <>The <strong>update</strong> — <C>--runtime</C> when publishing.</>,
                  ]}
                />
              </>
            ),
          },
          {
            id: "update-ids",
            title: "Updates are identified by ID (like Expo)",
            body: (
              <Bullets
                items={[
                  <>Every OTA update gets its own unique ID and a message describing the change — there is no version number to manage.</>,
                  <>Each update belongs to exactly one runtime version. The app page's <strong>Runtimes</strong> tab lists every store build with its updates and installed devices.</>,
                  <>Android and iOS updates published together (<C>--platform all</C>) share a group ID.</>,
                  <>An optional label (<C>--version 1.3.1-hotfix</C>) can be added for humans; it has no effect on delivery.</>,
                ]}
              />
            ),
          },
          {
            id: "strategy",
            title: "Choosing a strategy",
            body: (
              <Bullets
                items={[
                  <>Simplest: runtime version = marketing version (<C>versionName</C> / <C>CFBundleShortVersionString</C>), bumped with every store build.</>,
                  "Bump it when you add or upgrade a native dependency, change android/ or ios/, or upgrade React Native.",
                  <>Narrow a release further with a native version constraint such as <C>&gt;=1.3.0</C>, <C>^1.3.0</C> or <C>1.3.x</C>.</>,
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: "update-safety",
        title: "How updates stay safe",
        description: "Integrity checks, atomic installs and automatic recovery.",
        sections: [
          {
            id: "integrity",
            title: "Integrity",
            body: (
              <Bullets
                items={[
                  "Every package has a SHA-256 checksum computed by the server at upload.",
                  "The SDK downloads over HTTPS, verifies the checksum and rejects any mismatch before touching the running app.",
                  "Packages are unpacked into a staging folder and moved into place only when complete; paths that try to escape are rejected.",
                ]}
              />
            ),
          },
          {
            id: "recovery",
            title: "Automatic recovery",
            body: (
              <p>
                The previous bundle is kept until the new one confirms a successful launch. A bundle that crashes before{" "}
                <C>configure()</C> twice is discarded, the previous one is restored, and an <C>install_failed</C> event is reported.
              </p>
            ),
          },
          {
            id: "limits",
            title: "Checksums vs. signatures",
            body: (
              <Callout kind="note">
                Checksums prove a package was not corrupted or swapped after upload. To prove <strong>who</strong> built it — even if an
                API key, your FireOTA account or the bucket were compromised — turn on <A to="/docs/code-signing">code signing</A>.
              </Callout>
            ),
          },
        ],
      },
      {
        slug: "code-signing",
        title: "Code signing",
        description: "Prove every update was built by you (optional, per app).",
        sections: [
          {
            id: "how",
            title: "How it works",
            body: (
              <Bullets
                items={[
                  "You generate an RSA key pair. The private key never leaves your machine or CI secret store.",
                  "The CLI signs the package's SHA-256 together with its runtime version and platform (RSA-SHA256, PKCS#1 v1.5).",
                  "FireOTA verifies the signature against the app's registered public key on upload; with “Require signed updates” on, unsigned uploads and publishes are refused.",
                  "The app embeds the same public key and verifies the signature natively before downloading — a forged update is never installed.",
                ]}
              />
            ),
          },
          { id: "keys", title: "Create keys and publish", body: <Code code={SIGNING} /> },
          { id: "app", title: "Configure the app", body: <Code language="tsx" code={SIGNING_APP} /> },
          {
            id: "rotate",
            title: "Rotating keys",
            body: (
              <p>
                Ship a store build with the new public key first, then replace the key in the dashboard. Builds with the old certificate
                keep accepting only updates signed with the old key, so publish to each runtime with the key its build embeds.
              </p>
            ),
          },
        ],
      },
      {
        slug: "security",
        title: "Security monitoring",
        description: "How FireOTA detects malicious and risky activity.",
        sections: [
          {
            id: "rules",
            title: "What is detected",
            body: (
              <Bullets
                items={[
                  "Five or more destructive actions (deletions, rollbacks, revocations, removals) by one actor within 10 minutes.",
                  "A revoked or expired API key being used; a key used from a new IP address.",
                  "Members made owner/admin, admin invitations and full-access (*) API keys.",
                  "Uploads with a wrong checksum or an invalid signature, and code signing being turned off.",
                  "Production updates published straight to 100%.",
                  "Prompt-injection attempts against agents and instruction-like text in workspace data.",
                ]}
              />
            ),
          },
          {
            id: "where",
            title: "Where alerts go",
            body: (
              <p>
                Alerts appear on the <A to="/security">Security</A> page and in notifications; medium and high alerts are also sent to
                webhooks subscribed to <C>security.alert</C>. The Security sentinel agent can investigate them for you.
              </p>
            ),
          },
        ],
      },
      {
        slug: "agents",
        title: "AI agents",
        description: "Deploy, review and investigate with your own Claude or OpenAI key.",
        sections: [
          {
            id: "setup",
            title: "Bring your own key",
            body: (
              <p>
                An admin adds an Anthropic (Claude) or OpenAI API key under <A to="/agents">Agents → AI provider</A>. The key is verified,
                stored encrypted and never returned to the browser; usage is billed to your provider account.
              </p>
            ),
          },
          {
            id: "agents",
            title: "Built-in agents",
            body: (
              <Bullets
                items={[
                  <><strong>Release manager</strong> — publishes, promotes and advances rollouts based on release health; rolls back when needed.</>,
                  <><strong>Release reviewer</strong> — reviews updates (signing, runtime, failure rate) and recommends go / hold / roll back.</>,
                  <><strong>Security sentinel</strong> — investigates security alerts, audit logs and API key use; proposes containment.</>,
                ]}
              />
            ),
          },
          {
            id: "safety",
            title: "Guardrails",
            body: (
              <Bullets
                items={[
                  "An agent never has more rights than the member who asked it.",
                  "Each tool is Allowed, Needs approval or Denied per agent; write tools need approval by default.",
                  "Every tool call is recorded in the agent history and the audit log.",
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: "roles",
        title: "Roles and permissions",
        description: "Who can do what in a FireOTA workspace.",
        sections: [
          {
            id: "roles",
            title: "Roles",
            body: (
              <Bullets
                items={[
                  <><strong>Owner</strong> — everything, including deleting the workspace.</>,
                  <><strong>Admin</strong> — apps, channels, team and custom roles, API keys (admin-only), webhooks, Firebase projects, deleting releases and apps, security alerts, workspace settings.</>,
                  <><strong>Release manager</strong> — publish, pause, roll back, archive, change rollouts, read audit logs.</>,
                  <><strong>Developer</strong> — create releases and upload bundles; cannot publish.</>,
                  <><strong>Viewer</strong> — read-only.</>,
                ]}
              />
            ),
          },
          {
            id: "custom",
            title: "Custom roles",
            body: (
              <p>
                Owners and admins can create roles such as “QA lead” with exactly the permissions they need on the{" "}
                <A to="/team">Team</A> page, assign them to members, suspend or reactivate members and remove them. Nobody can grant a
                permission they do not hold themselves.
              </p>
            ),
          },
          {
            id: "enforced",
            title: "Enforced on the server",
            body: <p>Every action is checked on the server, so hiding a button is never the only protection. Every change is audited.</p>,
          },
        ],
      },
    ],
  },
  {
    title: "Reference",
    icon: "menu_book",
    pages: [
      {
        slug: "sdk-reference",
        title: "SDK reference",
        description: "The JavaScript API of @fireota/react-native.",
        sections: [{ id: "api", title: "API", body: <Code language="ts" code={SDK_API} /> }],
      },
      {
        slug: "cli-reference",
        title: "CLI reference",
        description: "Commands of @fireota/cli. Configure with FIREOTA_URL and FIREOTA_API_KEY.",
        sections: [
          {
            id: "commands",
            title: "Commands",
            body: (
              <Code
                code={`fireota publish  --app <appId> --platform <android|ios|all> --runtime <x.y.z> --message "…"
                 [--channel production] [--rollout 10] [--version <label>] [--mandatory] [--native ">=1.4.0"]
                 [--file update.fota] [--private-key key.pem] [--json]
fireota bundle   --platform <android|ios> [--entry index.js] [--out update.fota] [--hermes auto|on|off]
fireota whoami
fireota signing generate [--out ./fireota-keys]
fireota release create   --app <appId> --platform <p> --runtime <r> [--message m] [--version v] [--channel c]
fireota release upload   <releaseId> --file update.fota [--private-key key.pem]
fireota release publish  <releaseId> [--rollout 100]
fireota release rollout  <releaseId> --percentage <0-100>
fireota release pause    <releaseId>
fireota release rollback <releaseId> --reason "…" [--target <releaseId>]
fireota releases [--app <appId>] [--json]

Environment: FIREOTA_URL, FIREOTA_API_KEY (required); FIREOTA_APP_ID, FIREOTA_CHANNEL, FIREOTA_RUNTIME,
FIREOTA_SIGNING_KEY / FIREOTA_SIGNING_KEY_PATH (optional)`}
              />
            ),
          },
        ],
      },
      {
        slug: "api-reference",
        title: "REST API",
        description: "Endpoints used by the SDK, CLI and your own tooling.",
        sections: [
          { id: "check", title: "Update check (public, rate limited)", body: <Code language="http" code={CHECK_API} /> },
          { id: "events", title: "Device events (public, rate limited)", body: <Code language="http" code={EVENTS_API} /> },
          { id: "ci", title: "Releases (API key)", body: <Code language="http" code={CI_API} /> },
          {
            id: "health",
            title: "Health",
            body: <p><C>GET /health</C>, <C>/health/live</C> and <C>/health/ready</C> report configuration and database status for load balancers.</p>,
          },
        ],
      },
      {
        slug: "webhooks",
        title: "Webhooks",
        description: "Receive signed release events in Slack, PagerDuty or your own service.",
        sections: [
          {
            id: "events",
            title: "Events",
            body: (
              <p>
                <C>release.created</C>, <C>release.ready</C>, <C>release.published</C>, <C>release.paused</C>, <C>release.rolled_back</C>,{" "}
                <C>release.failed</C>, <C>release.archived</C>, <C>release.deleted</C>, <C>rollout.updated</C>, <C>rollout.completed</C>,{" "}
                <C>channel.created</C>, <C>channel.updated</C>, <C>channel.deleted</C>, <C>app.created</C>, <C>app.deleted</C>,{" "}
                <C>firebase.disconnected</C>, <C>firebase.expired</C>, <C>agent.approval_requested</C>, <C>security.alert</C>. The “Send
                test event” button sends <C>webhook.test</C> and reports the result.
              </p>
            ),
          },
          { id: "verify", title: "Verify signatures", body: <Code language="js" code={WEBHOOK_VERIFY} /> },
          {
            id: "retries",
            title: "Retries",
            body: <p>Failed deliveries are retried with exponential backoff (1, 2, 4, 8, 16 minutes) and then marked as dead letters. Deliveries never affect the release that triggered them.</p>,
          },
        ],
      },
      {
        slug: "self-hosting",
        title: "Self-hosting and deployment",
        description: "Run your own FireOTA server.",
        sections: [
          { id: "env", title: "Environment", body: <Code code={ENV} /> },
          {
            id: "database",
            title: "Database",
            body: <p>Apply every SQL file in <C>supabase/migrations</C> in order to a Supabase project, then configure Auth redirect URLs and providers.</p>,
          },
          { id: "scheduler", title: "Scheduler", body: <Code code={CRON} /> },
          {
            id: "limits",
            title: "Limits",
            body: <Callout kind="note">Uploads are buffered to verify their checksum, so packages are capped at 40 MB to fit edge-worker memory.</Callout>,
          },
        ],
      },
    ],
  },
  {
    title: "Help",
    icon: "help",
    pages: [
      {
        slug: "troubleshooting",
        title: "Troubleshooting",
        description: "Fixes for the most common problems.",
        sections: [
          {
            id: "no-update",
            title: "Devices never get the update",
            body: (
              <>
                <p>Go through this list in order — the first item is by far the most common cause:</p>
                <Steps
                  items={[
                    <><strong>Runtime mismatch.</strong> Open the app's <strong>Runtimes</strong> tab and find your device. Its runtime must equal the update's runtime exactly (<C>1.0</C> ≠ <C>1.0.0</C>). Fix the app version or publish with the device's runtime.</>,
                    <><strong>Debug build.</strong> Debug builds load JavaScript from Metro and ignore OTA. Install a release build.</>,
                    <><strong>Wrong channel.</strong> The <C>channel</C> in <C>fireota.config.js</C> must be the channel you published to.</>,
                    <><strong>Not published / outside the rollout.</strong> The release must be <strong>published</strong> (not draft or paused) and the device inside the rollout percentage.</>,
                    <><strong>Wrong App ID or server URL</strong> in the config — no <C>update_check</C> events appear in Analytics at all.</>,
                    <><strong>Native wiring missing.</strong> The update downloads but never runs: <C>MainApplication</C> / <C>bundleURL()</C> was not changed — see <D to="android-setup">Android</D> / <D to="ios-setup">iOS setup</D>.</>,
                  ]}
                />
              </>
            ),
          },
          {
            id: "init-ios",
            title: "fireota init prints “! unknown template” for iOS",
            body: (
              <p>
                React Native 0.88+ moved <C>bundleURL()</C> to <C>SceneDelegate.swift</C>. Edit it by hand and add the bridging header as
                described in <D to="ios-setup">iOS setup</D>.
              </p>
            ),
          },
          {
            id: "ios-header",
            title: "iOS: “Cannot find 'FireOTA' in scope”",
            body: (
              <p>
                Swift cannot see the SDK. Add <C>#import &lt;FireOTA.h&gt;</C> to the bridging header, set <strong>Objective-C Bridging
                Header</strong> in Build Settings, run <C>pod install</C> and build from the <C>.xcworkspace</C>.
              </p>
            ),
          },
          {
            id: "old-version",
            title: "The old version keeps running",
            body: <p>Normal updates apply on the next cold start. Swipe the app away and open it again, or publish a mandatory update.</p>,
          },
          {
            id: "rolled-back",
            title: "The update was rolled back automatically",
            body: <p>The new bundle crashed before <C>FireOTA.configure()</C> ran. Make sure it is called at startup, fix the crash and publish a new version.</p>,
          },
          {
            id: "images",
            title: "Images are missing after an update",
            body: <p>Publish with <C>fireota bundle</C> or <C>fireota publish</C> so the images are packed next to the bundle.</p>,
          },
          {
            id: "upload",
            title: "Upload fails",
            body: <p>Open <A to="/projects">Projects</A> → <strong>Verify connection</strong>; Storage must be writable. Packages must be <C>.fota</C> files under 40 MB.</p>,
          },
          {
            id: "publish",
            title: "Release could not be published",
            body: <p>Versions must look like <C>1.4.2</C>, the platform must be enabled for the app, and a version can exist only once per channel.</p>,
          },
          {
            id: "api-key",
            title: "API key rejected",
            body: <p>Check the scopes: <C>release.write</C> to create and upload, <C>release.publish</C> to publish, pause and roll back, <C>rollout.write</C> to change rollouts.</p>,
          },
        ],
      },
    ],
  },
];

export const allPages = docGroups.flatMap((g) => g.pages.map((p) => ({ ...p, group: g })));

export function findPage(slug: string) {
  const index = allPages.findIndex((p) => p.slug === slug);
  return index === -1 ? null : { page: allPages[index]!, prev: allPages[index - 1] ?? null, next: allPages[index + 1] ?? null };
}
