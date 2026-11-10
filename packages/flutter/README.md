# fireota

Over-the-air updates for Flutter apps, with [FireOTA](https://fireota.creoai.in).

- **Dart code push on Android.** Fix a bug or change a screen, then run `fireota flutter patch android`. Users get the new Dart code on their next app start, without a Play Store release.
- **Asset and config updates on Android and iOS.** Replace images and ship remote config without a store release.
- **Safe by default.** Updates are signed and checksummed, roll out to a percentage of devices, and roll back automatically when a patch crashes before its first frame.
- **Your infrastructure.** FireOTA runs on your own deployment, and bundles live in your own cloud storage.

| | Android | iOS |
| --- | --- | --- |
| Dart code patches | ✅ (opt-in) | ❌ (see [Limits](#limits)) |
| Asset and config updates | ✅ | ✅ |
| Signing, staged rollout, automatic rollback | ✅ | ✅ |

## How it works

`fireota flutter release android` builds your store build and records a fingerprint of its compiled Dart code (`libapp.so`). Later, `fireota flutter patch android` compiles your current Dart code with the **same Flutter version**, signs it and publishes it.

On the device, the SDK checks that the patch was built for exactly this store build, then downloads it and verifies the checksum and signature. On the next cold start it hands the patch to the Flutter engine. If the patch fails to load or crashes before its first frame, the app goes back to the code it had before and reports it to your dashboard.

## Install

```sh
flutter pub add fireota
npm install -g @fireota/cli     # or use npx @fireota/cli
fireota init --app <app-id> --server-url https://your-fireota-deployment
```

`fireota init` makes three changes:

- **Config:** writes `lib/fireota_config.dart`.
- **`main.dart`:** starts FireOTA before `runApp`.
- **`MainActivity`:** makes it extend `FireOTAFlutterActivity`.

You can also do this by hand:

```dart
import 'package:fireota/fireota.dart';
import 'package:flutter/material.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await FireOTA.init(const FireOTAConfig(
    appId: 'my-app',
    serverUrl: 'https://ota.example.com',
  ));
  runApp(const MyApp());
}
```

```kotlin
// android/app/src/main/kotlin/.../MainActivity.kt
import dev.fireota.flutter.FireOTAFlutterActivity

class MainActivity : FireOTAFlutterActivity()
```

If you create Flutter engines yourself, pass the patch to them too:

```kotlin
FlutterEngine(context, FireOTA.engineArgs(context))
FlutterEngineGroup(context, FireOTA.engineArgs(context))
```

## Ship a code patch (Android)

1. **Create a signing key, once.** Code patches are always signed.

   ```sh
   fireota signing generate --out ./fireota-keys
   ```

   Add `fireota-keys/fireota-public.pem` in the dashboard under **Code signing**, and to your app:

   ```dart
   const fireotaConfig = FireOTAConfig(
     appId: 'my-app',
     serverUrl: 'https://ota.example.com',
     allowCodePush: true,
     codeSigningCertificate: '''-----BEGIN PUBLIC KEY-----
   ...
   -----END PUBLIC KEY-----''',
   );
   ```

2. **Build and record the store build.** Commit the file it writes under `.fireota/flutter/`.

   ```sh
   fireota flutter release android
   ```

   Upload `build/app/outputs/bundle/release/app-release.aab` to Google Play as usual.

3. **Change Dart code and publish a patch.**

   ```sh
   export FIREOTA_URL=https://ota.example.com FIREOTA_API_KEY=fota_sk_...
   fireota flutter patch android --app my-app --private-key fireota-keys/fireota-private.pem \
     --message "Fix checkout total" --rollout 10
   ```

   Raise the rollout from the dashboard when the patch looks healthy.

The runtime version is your `pubspec.yaml` version, for example `1.4.0+12`. A patch only reaches devices running that exact store build. Bump the version for every store release.

## Asset and config updates (Android and iOS)

```sh
fireota flutter assets --platform all --app my-app --assets ./ota-assets --config ./config.json --message "Holiday theme"
```

```dart
FireOTAImage('assets/banner.png')              // the updated file, or the bundled asset
final theme = FireOTA.config['theme'];         // remote config from config.json
```

On Android, asset updates apply on the next start. On iOS, `FireOTA.restart()` (or `InstallMode.immediate`) switches them in place.

## UI

```dart
const FireOTAUpdateBanner()                    // "An update is ready" with a Restart button
FireOTABuilder(builder: (context, state) => Text(state.status.name))
await FireOTA.sync()                           // check, download and install now
```

## Store policy

**Google Play** forbids apps from downloading executable code, such as `.so` files, from outside Google Play. Code that runs in a virtual machine or interpreter is exempt. A FireOTA code patch is compiled Dart code that runs in the Dart VM, the same position Shorebird takes. It is still a judgement call whether that is allowed, so code push is **off by default**:

- Turn on `allowCodePush` only for apps where you accept that risk, such as enterprise, MDM or sideloaded apps, or after your own review of the policy.
- For Play apps that cannot accept the risk, use asset and config updates only.
- Never change what your app is for through a patch. Ship new features through the store.

**Apple App Store**: guideline 3.3.2 allows downloaded content that does not change the app's primary purpose. The iOS SDK never installs code, only assets and config.

## Limits

- **iOS code push** needs a modified Flutter engine and a Dart interpreter, which this package does not include. iOS gets asset and config updates.
- **Native code** cannot be patched: Kotlin/Java, Swift/Objective-C, and adding, removing or upgrading plugins with native code. `fireota flutter patch` refuses when the native plugins differ from the store build.
- **Flutter version:** a patch must be built with exactly the Flutter version of its store build. The CLI checks this.
- **ABIs:** patches include `arm64-v8a` by default. Add others with `--abis arm64-v8a,armeabi-v7a,x86_64`, as long as the store build includes them. Devices with other ABIs keep the store build's code.
- **Patch size:** a patch is your app's full compiled Dart library, compressed (often 3–10 MB).

## Troubleshooting

| Reported reason | Meaning |
| --- | --- |
| `runtime_incompatible` | The patch was built for another store build (version or build number). |
| `base_mismatch` | The store build on the device differs from the one recorded for the patch. |
| `code_push_disabled` | `allowCodePush` is off in this build. |
| `code_push_not_configured` | `MainActivity` does not extend `FireOTAFlutterActivity`. |
| `patch_not_loaded` | The engine could not load the patch, so the app rolled back to its previous code. |
| `launch_not_confirmed` | The patch crashed before its first frame and was rolled back. |
| `signing_not_configured` / `signature_invalid` | The app has no `codeSigningCertificate`, or the patch was signed with another key. |

If your Flutter app and the pub cache are on different drives on Windows, add `kotlin.incremental=false` to `android/gradle.properties`. This is a Kotlin build issue, not a FireOTA one.

## License

MIT
