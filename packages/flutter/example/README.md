# fireota example

A minimal app that shows the update status and tries Dart code push on Android.

## Run it

```sh
flutter run --release \
  --dart-define=FIREOTA_APP_ID=<your app ID> \
  --dart-define=FIREOTA_URL=https://<your FireOTA deployment> \
  --dart-define=FIREOTA_CERTIFICATE="$(cat fireota-public.pem)"
```

`MainActivity` extends `FireOTAFlutterActivity`, so the engine starts with the installed code patch.

## Try code push

1. Record the store build: `fireota flutter release android --apk`, then install the APK.
2. Change `message` in `lib/main.dart`.
3. Publish a patch: `fireota flutter patch android --app <your app ID> --private-key fireota-private.pem --message "New text"`.
4. Open the app (it downloads the patch), then close and open it again. The new text appears.

See the [package README](https://pub.dev/packages/fireota) for setup, store policy and limits.
