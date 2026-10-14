/**
 * FireOTA documentation content. Every page lists its sections so the layout can render the
 * "On this page" table of contents. Add a page by adding an entry; routing is automatic.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Bullets, C, Callout, Code, ExtLink, PlatformTabs, Steps } from "./docs-ui";

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

const PUBLISH = `export FIREOTA_URL="https://ota.example.com"
export FIREOTA_API_KEY="fota_sk_live_..."   # Settings -> API keys

# from your React Native project root
npx fireota publish --app YOUR_APP_ID --platform android \\
  --version 1.3.1 --runtime 1.3.0 --channel beta --rollout 10 \\
  --notes "Fix crash on the budget screen"`;

const MANUAL = `npx fireota bundle --platform android --out android.fota   # bundle + Hermes + assets
npx fireota release create --app YOUR_APP_ID --platform android --version 1.3.1 --runtime 1.3.0
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
    strategy:
      matrix: { platform: [android, ios] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: >
          npx fireota publish --app \${{ vars.FIREOTA_APP_ID }} --platform \${{ matrix.platform }}
          --version 1.3.\${{ github.run_number }} --runtime 1.3.0 --channel beta --rollout 100
        env:
          FIREOTA_URL: \${{ vars.FIREOTA_URL }}
          FIREOTA_API_KEY: \${{ secrets.FIREOTA_API_KEY }}`;

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
        "id": "…", "version": "1.3.1", "runtimeVersion": "1.3.0", "mandatory": false, "notes": "…",
        "bundle": { "url": "https://firebasestorage.googleapis.com/…", "hash": "<sha256>", "size": 123456 } } } }
200 { "success": true, "data": { "updateAvailable": false, "reason": "up_to_date" } }`;

const EVENTS_API = `POST /api/public/v1/updates/events
{ "app": "<appId>", "releaseId": "<id>", "platform": "android", "installationId": "<stable id>",
  "runtimeVersion": "1.3.0", "event": "install_succeeded", "eventId": "<unique per event>" }
# event: download_started | download_completed | install_succeeded | install_failed | rollback`;

const CI_API = `# Authorization: Bearer fota_sk_...
POST /api/public/v1/releases                      create a draft     (scope release.write, Idempotency-Key supported)
GET  /api/public/v1/releases?appId=…              list releases      (scope release.read)
POST /api/public/v1/releases/:id/bundle           upload .fota       (scope release.write, multipart "bundle", x-bundle-sha256)
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
            id: "flow",
            title: "The update flow",
            body: (
              <Steps
                items={[
                  <>You build an update package (JS bundle + images) and upload it. It is stored in <strong>your own Firebase Cloud Storage</strong> bucket.</>,
                  <>FireOTA records the release — version, runtime, checksum, channel, rollout — and writes every action to the audit log.</>,
                  <>On launch, the SDK asks FireOTA whether a compatible release exists for this device.</>,
                  <>The SDK downloads it straight from your bucket, verifies the SHA-256 checksum and applies it on the next start.</>,
                  <>If the new code crashes before starting, the device returns to the previous bundle automatically and reports it.</>,
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
                ]}
              />
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
              <Steps
                items={[
                  <>Open the <ExtLink href="https://console.firebase.google.com">Firebase console</ExtLink> and create or select a project.</>,
                  <>Go to <strong>Build → Storage → Get started</strong> and create the default bucket. Choose a location close to your users.</>,
                  <>New buckets (<C>&lt;project&gt;.firebasestorage.app</C>) require the <strong>Blaze</strong> (pay-as-you-go) plan.</>,
                ]}
              />
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
            body: <Callout kind="tip">You do not need to add the Firebase SDK to your React Native app for OTA updates.</Callout>,
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
              <Steps
                items={[
                  <>Open <A to="/projects">Projects</A> and click <strong>Connect project</strong>.</>,
                  <>Sign in with the Google account that owns the Firebase project and allow access.</>,
                  <>Select the project and click <strong>Verify</strong>.</>,
                ]}
              />
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
              <Steps
                items={[
                  <>Open <A to="/apps/new">Applications → Add application</A>.</>,
                  <>Enter the name and choose the connected Firebase project.</>,
                  <>Fill in the Android package name and/or iOS bundle identifier exactly as in your app.</>,
                  <>Set the <D to="runtime-versions">runtime version</D> of the build that is (or will be) in the stores, e.g. <C>1.3.0</C>.</>,
                ]}
              />
            ),
          },
          {
            id: "channels",
            title: "Step 2. Channels",
            body: (
              <p>
                Four channels are created: <C>production</C>, <C>beta</C>, <C>staging</C> and <C>development</C>. A device subscribes to one
                channel (set in <C>configure()</C>) and receives the release currently published on it. Android and iOS releases on the
                same channel are independent.
              </p>
            ),
          },
          {
            id: "app-id",
            title: "Step 3. Copy the App ID",
            body: <p>Open the app in the dashboard and copy its <strong>App ID</strong> — the SDK and the CLI both need it.</p>,
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
            title: "Install the packages",
            body: (
              <Code
                code={`npm install @fireota/react-native
npm install --save-dev @fireota/cli
cd ios && pod install && cd ..`}
              />
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
        slug: "android-setup",
        title: "Android setup",
        description: "Load the latest verified OTA bundle in Android release builds.",
        sections: [
          {
            id: "bundle-file",
            title: "Point React Native at the OTA bundle",
            body: (
              <PlatformTabs
                tabs={[
                  { value: "host", label: "RN 0.76+ (ReactHost)", icon: "new_releases", content: <Code language="kotlin" code={ANDROID_HOST} /> },
                  { value: "kotlin", label: "Older, Kotlin", icon: "code", content: <Code language="kotlin" code={ANDROID_KOTLIN} /> },
                  { value: "java", label: "Older, Java", icon: "code", content: <Code language="java" code={ANDROID_JAVA} /> },
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
            id: "bundle-url",
            title: "Point React Native at the OTA bundle",
            body: (
              <PlatformTabs
                tabs={[
                  { value: "objc", label: "Objective-C", icon: "code", content: <Code language="objc" code={IOS_OBJC} /> },
                  { value: "swift", label: "Swift", icon: "code", content: <Code language="swift" code={IOS_SWIFT} /> },
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
            body: <Code language="js" code={CONFIGURE} />,
          },
          {
            id: "confirmation",
            title: "Launch confirmation",
            body: (
              <Callout kind="important">
                Call <C>configure()</C> early and unconditionally. Reaching it is how a new bundle proves it starts; a bundle that never
                reaches it is rolled back on the next launch.
              </Callout>
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
              <p>
                Build a release (<C>./gradlew bundleRelease</C> / Xcode Archive) and submit it as usual. Its runtime version must match the
                value in <C>configure()</C> and in the dashboard.
              </p>
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
              <p>
                In <A to="/settings/api-keys">Settings → API keys</A>, create a key with <C>release.write</C> and <C>release.publish</C>.
                The full key is shown once — store it as a secret.
              </p>
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
              <p>
                Start at 1–10%. Each device gets a stable bucket from its installation ID, so raising the percentage only adds devices — no
                device flips back and forth.
              </p>
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
            id: "github",
            title: "GitHub Actions",
            body: <Code language="yaml" code={GITHUB} />,
          },
          {
            id: "retries",
            title: "Safe retries",
            body: <p>The CLI sends an idempotency key derived from the release inputs, so a retried job never creates a duplicate release.</p>,
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
              <Steps
                items={[
                  <>Open a release build of the app — an <C>update_check</C> event appears in <A to="/analytics">Analytics</A>.</>,
                  <>After publishing, open the app, wait a few seconds, close it fully and reopen it.</>,
                  <><C>download_completed</C> and <C>install_succeeded</C> events confirm the update is running.</>,
                ]}
              />
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
              <p>
                A runtime version names a set of native code. A bundle runs only on binaries with <strong>exactly</strong> the same runtime
                version — the server and the SDK both enforce it, because JavaScript that calls missing native code crashes.
              </p>
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
            title: "Limits",
            body: (
              <Callout kind="note">
                Checksums prove a package was not corrupted or swapped after upload; they do not sign who published it. Protect your API
                keys and limit who can publish with team roles.
              </Callout>
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
                  <><strong>Owner</strong> — everything, including disconnecting Firebase projects and deleting the workspace.</>,
                  <><strong>Admin</strong> — apps, channels, team, API keys, webhooks, deleting releases.</>,
                  <><strong>Release manager</strong> — publish, pause, roll back, archive, change rollouts, read audit logs.</>,
                  <><strong>Developer</strong> — create releases and upload bundles; cannot publish.</>,
                  <><strong>Viewer</strong> — read-only.</>,
                ]}
              />
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
                code={`fireota bundle   --platform <android|ios> [--entry index.js] [--out update.fota] [--hermes auto|on|off]
fireota publish  --app <appId> --platform <p> --version <x.y.z> --runtime <x.y.z>
                 [--channel production] [--rollout 10] [--notes "…"] [--mandatory] [--native ">=1.4.0"] [--file update.fota]
fireota release create   --app <appId> --platform <p> --version <v> --runtime <r> [--channel c]
fireota release upload   <releaseId> --file update.fota
fireota release publish  <releaseId> [--rollout 100]
fireota release rollout  <releaseId> --percentage <0-100>
fireota release pause    <releaseId>
fireota release rollback <releaseId> --reason "…" [--target <releaseId>]
fireota releases [--app <appId>]`}
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
                <C>release.failed</C>, <C>release.archived</C>, <C>rollout.updated</C>, <C>rollout.completed</C>, <C>firebase.disconnected</C>,{" "}
                <C>firebase.expired</C>, <C>app.created</C>.
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
            body: <p>Runtime versions must match exactly, the release must be <strong>published</strong> on the device's channel, and the device must be inside the rollout. Debug builds load from Metro — test a release build.</p>,
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
