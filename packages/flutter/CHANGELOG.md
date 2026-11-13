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
