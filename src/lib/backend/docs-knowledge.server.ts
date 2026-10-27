/**
 * Background knowledge for "Ask AI": a product overview, the real CLI help text and a map of every
 * docs page. It is always sent with the retrieved doc excerpts, so the assistant can answer
 * questions the keyword search misses. Keep the overview in sync when features change.
 */
import { docGroups } from "@/components/docs/pages";

import CLI_SOURCE from "../../../packages/cli/bin/fireota.mjs?raw";

const OVERVIEW = `# FireOTA product knowledge

FireOTA ships over-the-air (OTA) JavaScript bundle updates to React Native apps without a store release. Website and dashboard: https://fireota.creoai.in. Docs: /docs. Source: https://github.com/Sujay-Dynamisch/FireOTA.

## Packages
- @fireota/react-native: the SDK inside the app. Checks for updates, downloads and verifies them, applies them on restart, rolls back a crashing update automatically, and has a built-in update UI plus ready-made screens (RequiredUpdateScreen, UpdateDialog, UpdateSheet, UpdatesSettingsCard in node_modules/@fireota/react-native/templates).
- @fireota/cli (command "fireota"): init, bundle, publish, release management, code signing keys, CI. Needs FIREOTA_URL and FIREOTA_API_KEY.

## Where data lives
- Each workspace connects its OWN Firebase project. Update bundles and assets are uploaded to that customer's Firebase Storage bucket, so storage and download costs are billed to the customer's Firebase/Google Cloud project, not to FireOTA. If billing is disabled on that project, uploads and downloads fail (HTTP 402).
- The FireOTA dashboard stores the metadata: workspaces, apps, channels, releases, rollouts, analytics events, API keys, roles, audit log.
- Different customers never share buckets; a test Firebase project is only for testing.

## Core concepts
- Workspace → apps (one per React Native app, with an App ID) → channels (production, beta, staging, development, or custom). A build listens to one channel.
- Runtime version: an update only reaches builds whose runtime version is exactly equal. Default runtime = the store version (Android versionName, iOS MARKETING_VERSION; Expo: expo.version). Bump it whenever native code changes and ship a new store build.
- Updates are identified by ID; --version is only a label. --native ">=1.4.0" limits by native app version.
- Release statuses: draft → uploading → ready → published; also paused, rolled_back, failed, archived. Archive a live release (ready/published/paused/rolled_back) first; delete works for draft, failed, ready, uploading and archived releases and also removes the bundle from Firebase Storage. Both are available from the Releases list and the release page.
- Rollouts: percentage of devices, using a stable bucket per installation, so raising the percentage only adds devices. Pause stops new downloads. Rollback (needs a reason) moves the channel to the previous or a chosen release with the same runtime. Automatic pause: after 25+ install reports, if failures exceed the threshold (2% by default).
- Mandatory updates: the SDK blocks the app until the update is installed.
- Code signing: fireota signing generate creates an RSA key pair; publish with --private-key; apps can require signed updates (unsigned uploads fail with SIGNATURE_REQUIRED).
- Security: bundle SHA-256 is verified after upload and on device; API keys are scoped; roles and permissions per workspace; webhooks; security monitoring; AI agents.
- Analytics: devices report events such as update checks, downloads, install succeeded/failed, rollbacks.

## Expo
Two options, pick one per app:
1. FireOTA SDK with its config plugin: Expo SDK 50+, development or release builds (not Expo Go), works with expo prebuild, EAS Build and expo-router. expo-updates must be removed (the plugin stops the build otherwise). Publish with the normal fireota publish.
2. Keep expo-updates, no EAS Update (CLI 0.5.0+): FireOTA implements the Expo Updates protocol. Set app.json updates.url to <FIREOTA_URL>/api/public/v1/expo/<appId>/manifest and requestHeaders {"expo-channel-name": "<channel>"}, make one store build, then publish with "fireota publish --expo". No native change or FireOTA SDK is needed. Updates apply on the next app launch (or call Updates.reloadAsync()). Expo updates cannot be code-signed yet. With no update to serve, FireOTA sends noUpdateAvailable, or rollBackToEmbedded after a rollback. EAS Build can still be used for builds.

## Platform support
- Supported: React Native apps on Android and iOS (bare React Native and Expo).
- Not supported: Flutter, fully native Kotlin/Java or Swift/Objective-C apps, and the web. OTA here means replacing the React Native JavaScript bundle and assets; native code always needs a store release (this is also what app store rules allow).

## Self-hosting
FireOTA can be self-hosted; see the Self-hosting and deployment page. Point FIREOTA_URL (CLI) and the SDK server URL at your own deployment.`;

function cliHelp() {
  const match = /const HELP = `([\s\S]*?)`;/.exec(CLI_SOURCE);
  return match ? match[1]!.replace(/\\`/g, "`") : "";
}

function docsMap() {
  return docGroups
    .map((group) => `${group.title}: ${group.pages.map((page) => `[${page.title}](/docs/${page.slug})`).join(", ")}`)
    .join("\n");
}

let cached: string | null = null;

/** Overview + CLI reference + docs map, built once per server instance. */
export function docsKnowledge() {
  cached ??= `${OVERVIEW}\n\n## CLI reference (fireota --help)\n${cliHelp()}\n\n## Docs map (link to these pages)\n${docsMap()}`;
  return cached;
}
