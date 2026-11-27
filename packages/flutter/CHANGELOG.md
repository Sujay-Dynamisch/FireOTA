## 0.3.1

Compatibility fixes (no API changes):
- Works in apps from Flutter 3.22 to the current release. Tested in CI by building freshly created apps for iOS and Android on Flutter 3.22.3 and stable.
- Android: minimum API 21 (was 24). The plugin's build script is now Groovy and adapts to the app: Android Gradle Plugin 7 or 8 with the Kotlin plugin, or AGP 9 with or without built-in Kotlin.
- iOS: minimum iOS 12 (was 15).

## 0.3.0

New:
- `FireOTAUpdatePrompt`: the full update flow as Material 3 dialogs that follow the app's theme (light and dark). "Update available" → Update → download progress with size and percent → "Update ready" → Restart now. A download that fails offers "Try again". Text is configurable with `FireOTAPromptLabels`.
- `FireOTAConfig.autoDownload` (default `true`). Set it to `false` so optional updates wait for the user; mandatory updates always download.
- Download progress on iOS too, so the progress bar shows size and percent on both platforms.
- A failed download now sets the `error` status.


## 0.2.0

Security:
- The server URL must use HTTPS in release builds. `allowInsecureServer` allows `http://` in debug and profile builds only.
- A malformed `codeSigningCertificate` now fails at startup instead of failing every update later.
- Downloads must match the size the server announced and cannot exceed `maxDownloadBytes` (default 200 MB, 512 MB absolute). Oversized updates are refused before downloading (`too_large`) and truncated ones after (`size_mismatch`).
- Unpacking refuses packages with more than 20,000 files or 1 GB of content.
- Downloads stop when the device is low on storage (`insufficient_storage`).
- Server replies over 1 MB are refused.

New:
- `downloadProgress` on `FireOTA.state` (Android).
- `checkOnResume` and `minCheckInterval`: check again when the app returns to the foreground.
- `headers`: extra request headers, for example for an API gateway.
- `onEvent`: receive every update event to forward to your crash reporting or analytics.
- `FireOTAUpdater.dispose()` for updaters you create yourself.

## 0.1.1

- Documentation: the example app now explains how to run it and try code push.
- First release published automatically from GitHub Actions.

## 0.1.0

First release.

- Dart code push on Android: `fireota flutter patch android` compiles a signed patch for a recorded store build, and `FireOTAFlutterActivity` starts the engine with it.
- Asset and remote-config updates on Android and iOS (`FireOTAImage`, `FireOTA.config`).
- Signed updates (RSA-SHA256), SHA-256 checksums and HTTPS-only downloads.
- Automatic rollback when a patch crashes before its first frame, or when the engine runs different code than the patch claims (`patch_not_loaded`). Failed patches are never downloaded again on that device.
- A new store build discards all patches.
- `FireOTAUpdateBanner` and `FireOTABuilder` widgets.
