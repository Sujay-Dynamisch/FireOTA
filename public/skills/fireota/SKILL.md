---
name: fireota
description: Set up FireOTA over-the-air updates in a React Native, Expo or Flutter app, publish an update, and wire it into CI. Use when the user asks to add OTA updates, code push, FireOTA, a CodePush or Shorebird replacement, or to ship a fix without a store release.
---

# Set up FireOTA

FireOTA ships updates to mobile apps without a store release: JavaScript bundles for React Native and Expo, and Dart code patches (Android) plus asset and config updates (Android and iOS) for Flutter. You install an SDK, run `fireota init`, make one store build, then publish updates with the `fireota` CLI.

Work through the steps in order. Prefer the CLI over hand edits: `fireota init` makes the native changes for you.

## 1. Ask the user for these first

- **FireOTA URL**, for example `https://fireota.example.com`. It must be `https://`.
- **App ID**, from the FireOTA dashboard: Applications → the app → App ID. If the app does not exist yet, ask the user to create it there first, with the Android and/or iOS platforms they ship.
- **Channel** the store build should follow. Default: `production`.
- For publishing only: a **FireOTA API key** (`fota_sk_…`, Settings → API keys). Use it through the `FIREOTA_API_KEY` environment variable. Never write it into a file.

Do not guess any of these values.

## 2. Detect the project

| You find | Project type |
| --- | --- |
| `pubspec.yaml` with a `flutter:` section | Flutter → step 3C |
| `package.json` with `expo` in dependencies | Expo → step 3B |
| `package.json` with `react-native` in dependencies | Bare React Native → step 3A |

Anything else (native-only Kotlin/Swift, web) is not supported. Tell the user and stop.

## 3A. Bare React Native

```sh
npm install @fireota/react-native
npm install --save-dev @fireota/cli
npx fireota init --app <APP_ID> --server-url <FIREOTA_URL> --channel <CHANNEL>
cd ios && pod install && cd ..
```

`init` writes `fireota.config.js`, wraps the root component with `withFireOTA`, patches `MainApplication` (`getJSBundleFile`) and `AppDelegate` (`bundleURL`), and adds an `ota:publish` script. Read its output: any line marked `!` needs a manual change. Make that change exactly as printed.

Runtime version = the store version (`versionName` / `MARKETING_VERSION`). Tell the user to bump it whenever native code changes.

## 3B. Expo

```sh
npx expo install @fireota/react-native
npm install --save-dev @fireota/cli
npx fireota init --app <APP_ID> --server-url <FIREOTA_URL> --channel <CHANNEL>
```

- `init` adds the `@fireota/react-native` config plugin to `app.json`. With `app.config.js`/`.ts`, add it to `plugins` by hand.
- `expo-updates` must not be installed alongside the SDK. If it is, ask the user: remove it, or keep it and use `fireota publish --expo` instead of the SDK (set `updates.url` to `<FIREOTA_URL>/api/public/v1/expo/<APP_ID>/manifest`).
- Expo Go cannot run FireOTA. Use a development or release build (`npx expo run:android --variant release`, or EAS Build).
- Runtime version = `expo.version` in `app.json`.

## 3C. Flutter

```sh
flutter pub add fireota
npx @fireota/cli init --app <APP_ID> --server-url <FIREOTA_URL> --channel <CHANNEL>
```

`init` writes `lib/fireota_config.dart`, makes `main()` call `await FireOTA.init(fireotaConfig)` before `runApp`, and makes `MainActivity` extend `FireOTAFlutterActivity`. Then add the update dialogs once: `MaterialApp(builder: (context, child) => FireOTAUpdatePrompt(child: child!))`, and set `autoDownload: false` in the config if the user should tap Update before a download.

- Runtime version = the `pubspec.yaml` version with its build number (`1.4.0+12`). Bump it for every store release.
- iOS gets asset and config updates only, never code.
- **Android Dart code push is opt-in.** Turn it on only if the user wants it after reading the store-policy note: Google Play only allows downloaded code that runs in a VM or interpreter. To enable it:
  1. Set up code signing (step 4). Code patches are always signed.
  2. In `lib/fireota_config.dart`, set `allowCodePush: true` and `codeSigningCertificate` to the contents of `fireota-public.pem`.
  3. Build and record the store build: `npx @fireota/cli flutter release android`. Commit the file it writes under `.fireota/flutter/`.
- If the project is on Windows and the pub cache is on another drive, add `kotlin.incremental=false` to `android/gradle.properties` when the Android build fails with "Could not close incremental caches".

## 4. Code signing (recommended; required for Flutter code patches)

```sh
npx @fireota/cli signing generate --out ./fireota-keys
```

- Add `fireota-keys/` to `.gitignore` before anything else. The private key must never be committed or printed.
- Tell the user to paste `fireota-keys/fireota-public.pem` into the dashboard: the app → Code signing.
- Put the public key in the app config: `codeSigningCertificate` in `fireota.config.js` (React Native) or `lib/fireota_config.dart` (Flutter).
- In CI, store the private key as the secret `FIREOTA_SIGNING_KEY`.

## 5. Verify

Run the project's own checks, then confirm:

- React Native/Expo: the app builds in release mode, and `fireota.config.js` has the right App ID and URL.
- Flutter: `flutter analyze` is clean and `flutter build apk --release` succeeds. `lib/main.dart` calls `FireOTA.init` before `runApp`, and `MainActivity` extends `FireOTAFlutterActivity`.
- `git status` shows no private key or API key.

Updates only load in release builds. Debug builds use the dev server or `flutter run`.

## 6. Publish an update (when the user asks)

```sh
export FIREOTA_URL=<FIREOTA_URL> FIREOTA_API_KEY=<from the user, never written to disk>

# React Native / Expo
npx fireota publish --app <APP_ID> --platform all --message "What changed" --rollout 10 [--private-key fireota-keys/fireota-private.pem]

# Flutter, Android code patch (after step 3C's store build is live)
npx @fireota/cli flutter patch android --app <APP_ID> --private-key fireota-keys/fireota-private.pem --message "What changed" --rollout 10

# Flutter, assets and config (Android and iOS)
npx @fireota/cli flutter assets --platform all --app <APP_ID> --assets ./ota-assets --config ./config.json --message "What changed"
```

Start with a small `--rollout` and let the user raise it from the dashboard.

## 7. CI (when the user asks)

Add secrets `FIREOTA_URL`, `FIREOTA_API_KEY` and, if signing, `FIREOTA_SIGNING_KEY`. Run the step 6 publish command after the build job, on the release branch only. The CLI detects GitHub Actions, GitLab, Bitbucket, Jenkins, Azure DevOps, CircleCI, Bitrise and Codemagic automatically.

## Never

- Never commit or print `FIREOTA_API_KEY` or the private signing key.
- Never ship native code changes (Kotlin, Java, Swift, Objective-C, new or upgraded native plugins) as an OTA update. They need a store release with a bumped version.
- Never install `expo-updates` alongside `@fireota/react-native`.
- Never use an `http://` FireOTA URL in a release build.

Docs: https://fireota.creoai.in/docs (React Native), https://fireota.creoai.in/docs/expo, https://fireota.creoai.in/docs/flutter.
