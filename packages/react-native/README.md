<p align="center">
  <img src="../public/logo-mark.png" alt="FireOTA" width="96" />
</p>

<h1 align="center">FireOTA</h1>

<p align="center">
  Over-the-air updates for React Native — served from <strong>your own Firebase project</strong>.<br />
  Staged rollouts, checksum verification, automatic rollback, audit logs and a CI-ready CLI.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fireota/react-native"><img alt="@fireota/react-native" src="https://img.shields.io/npm/v/@fireota/react-native?label=%40fireota%2Freact-native" /></a>
  <a href="https://www.npmjs.com/package/@fireota/cli"><img alt="@fireota/cli" src="https://img.shields.io/npm/v/@fireota/cli?label=%40fireota%2Fcli" /></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue" />
</p>

---

## What it does

Ship JavaScript fixes and features to your React Native app **without a store review**:

1. `npx fireota publish` bundles your JS (Hermes bytecode + images) and uploads it to **your** Firebase Storage bucket.
2. FireOTA records the release — version, runtime, SHA-256, channel, rollout — and writes every action to an audit log.
3. The SDK in your app checks for a compatible release on launch, downloads it **directly from your bucket**, verifies the checksum, and applies it on the next start.
4. If the new bundle crashes before starting, the device rolls back to the previous bundle automatically and reports it.

You own the artifacts and pay Google directly for storage and bandwidth. FireOTA never proxies downloads.

## Features

| | |
| --- | --- |
| **Releases** | Strict state machine (draft → ready → published → paused / rolled back / archived), atomic publish and rollback |
| **Rollouts** | Deterministic per-device buckets, 0–100 %, per-platform channel targets (Android and iOS independent) |
| **Safety** | Server-side SHA-256, exact runtime matching, native-version constraints, automatic pause on high failure rates |
| **Teams** | Organizations, roles (owner, admin, release manager, developer, viewer), Supabase Row Level Security |
| **Integrations** | Scoped API keys, CI/CD API, HMAC-signed webhooks with retries, notifications, analytics |
| **Firebase** | Google OAuth (PKCE) per customer project, encrypted refresh tokens, live Storage write verification |

## Repository layout

```text
src/                     Web dashboard + API (TanStack Start, React, Tailwind)
  routes/                Pages and HTTP routes (/api/public/v1/*, /health, /docs)
  lib/backend/           Release engine, OTA resolver, Firebase adapter, RBAC, webhooks
  lib/api/               Server functions used by the dashboard
  components/docs/       Documentation site content (/docs)
supabase/migrations/     Database schema, RLS policies and transactional functions
packages/react-native/   @fireota/react-native — the app SDK (Kotlin + Objective-C)
packages/cli/            @fireota/cli — bundle, upload and publish from a terminal or CI
tests/                   Integration, end-to-end and package-format tests
```

## Quick start (local)

**Prerequisites:** Node.js 20+, a [Supabase](https://supabase.com) project, a Google Cloud OAuth client.

```sh
git clone https://github.com/Sujay-Dynamisch/FireOTA.git
cd FireOTA
npm install
```

### 1. Environment

Create `.env` in the project root (never commit it):

```sh
# Supabase -> Project Settings -> API
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_PROJECT_ID="<project-ref>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"

# Server-only secrets
SUPABASE_SERVICE_ROLE_KEY="..."        # Supabase -> API Keys -> Secret key (bypasses RLS)
FIREOTA_ENCRYPTION_KEY="..."           # random; encrypts Google tokens and webhook secrets — never change it
FIREOTA_CRON_SECRET="..."              # bearer token for the maintenance endpoint

# Google Cloud -> APIs & Services -> Credentials -> OAuth client (Web application)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:8080/api/public/v1/firebase/callback"
```

Generate random secrets with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 2. Database

Apply every file in `supabase/migrations/` in order — with the Supabase CLI (`supabase link` then `supabase db push`) or by running them in the SQL editor.

### 3. Auth and Google OAuth

- **Supabase → Authentication → URL Configuration:** Site URL `http://localhost:8080`; add redirect URLs `http://localhost:8080/dashboard`, `/onboarding`, `/reset-password`.
- **Supabase → Authentication → Providers → Google:** enable it with your OAuth client for "Continue with Google".
- **Google Cloud → OAuth client → Authorised redirect URIs:** add `http://localhost:8080/api/public/v1/firebase/callback` and `https://<project-ref>.supabase.co/auth/v1/callback`.

### 4. Run

```sh
npm run dev        # http://localhost:8080
```

Open `/signup`, create your workspace, connect a Firebase project (Cloud Storage must be set up) and register your app.

## Deploy to Vercel

The repository includes [`vercel.json`](vercel.json). Nitro detects Vercel and builds a Node.js function plus static assets.

1. Import the repository in Vercel (no framework preset needed).
2. Add every variable from the `.env` section under **Project → Settings → Environment Variables**, with production URLs:
   - `GOOGLE_REDIRECT_URI=https://<your-domain>/api/public/v1/firebase/callback`
   - `CRON_SECRET=<random>` — Vercel sends it to the maintenance cron automatically.
3. Deploy, then update the production URLs in Supabase Auth and in the Google OAuth client.
4. Check `https://<your-domain>/health/ready` returns `{"status":"ok"}`.

The cron in `vercel.json` runs the maintenance job (webhook retries, OAuth state cleanup) daily, which works on the Hobby plan. On Pro, change the schedule to `*/5 * * * *` for faster webhook retries.

> **Upload size on Vercel:** Vercel Functions accept request bodies up to **4.5 MB**. Larger update packages must be published against a deployment without that limit (or a direct-to-Storage upload, on the roadmap).

## Install

```sh
npm install @fireota/react-native
npm install --save-dev @fireota/cli
cd ios && pod install
```

Requires a bare React Native app, 0.73 or newer (Expo: run `npx expo prebuild`).

## Android

In `MainApplication.kt` (React Native 0.76+ template):

```kotlin
import dev.fireota.reactnative.FireOTA

override val reactHost: ReactHost by lazy {
  getDefaultReactHost(
    context = applicationContext,
    packageList = PackageList(this).packages,
    jsBundleFilePath = if (BuildConfig.DEBUG) null else FireOTA.getJSBundleFile(applicationContext),
  )
}
```

Older templates that override `reactNativeHost`:

```kotlin
override fun getJSBundleFile(): String? =
  if (BuildConfig.DEBUG) super.getJSBundleFile()
  else FireOTA.getJSBundleFile(applicationContext) ?: super.getJSBundleFile()
```

## iOS

```objc
// AppDelegate.mm
#import <FireOTA.h>

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [FireOTA bundleURL] ?: [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
```

Swift: add `#import <FireOTA.h>` to the bridging header and return `FireOTA.bundleURL() ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")` from `bundleURL()` in release builds.

## Configure

Call once, early and unconditionally (e.g. `index.js`). Reaching this call confirms a new bundle starts; a bundle that never reaches it is rolled back on the next launch.

```js
import FireOTA from "@fireota/react-native";

if (!__DEV__) {
  FireOTA.configure({
    appId: "YOUR_APP_ID",
    serverUrl: "https://ota.example.com",
    runtimeVersion: "1.3.0", // must equal this store build; bump when native code changes
    channel: "production",
  });
}
```

By default updates download silently and apply on the next cold start; mandatory updates restart immediately. To show your own prompt, set `checkOnAppStart: false` and use the API:

```js
const result = await FireOTA.checkForUpdate();
if (result.updateAvailable) {
  // show your UI with result.release.version / result.release.notes, then:
  await FireOTA.downloadUpdate(result.release);
  await FireOTA.installUpdate(result.release, "immediate");
}
```

## API

| Method | Description |
| --- | --- |
| `configure(options)` | Initialize once at startup (required). |
| `sync()` | Check, download and install, honouring install modes. |
| `checkForUpdate()` | `{ updateAvailable, reason?, release? }` |
| `downloadUpdate(release)` | Download and verify; the running bundle is untouched. |
| `installUpdate(release, mode)` | `"nextRestart"` or `"immediate"`. |
| `reload()` | Restart now to apply a pending update. |
| `clearPendingUpdate()` | Drop a downloaded update that is not applied yet. |
| `getCurrentRelease()` | `{ releaseId, pendingReleaseId, installationId }` |
| `getUpdateStatus()` | Current status string. |

Options: `appId`, `serverUrl`, `runtimeVersion` (required), `channel`, `checkOnAppStart`, `installMode`, `mandatoryInstallMode`, `onStatusChange(status, detail)`.

## Publishing updates

Use [`@fireota/cli`](https://www.npmjs.com/package/@fireota/cli):

```sh
npx fireota publish --app YOUR_APP_ID --platform android --version 1.3.1 --runtime 1.3.0 --channel production --rollout 10
```

## License

MIT
