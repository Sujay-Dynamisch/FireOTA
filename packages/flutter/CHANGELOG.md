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
