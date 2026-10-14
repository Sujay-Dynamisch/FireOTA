# @fireota/react-native

Over-the-air JavaScript updates for React Native, served from **your own Firebase project** by [FireOTA](https://www.npmjs.com/package/@fireota/cli).

- SHA-256 verified downloads, straight from your Firebase Storage bucket
- Staged rollouts, pause and rollback from the FireOTA dashboard
- Automatic rollback when a new bundle crashes before it starts
- Old updates are discarded when a new store build is installed
- No third-party native dependencies

> **Beta (0.x).** Verified on Android with React Native 0.87. iOS support is implemented but not yet device-tested.

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
