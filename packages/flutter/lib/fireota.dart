/// Over-the-air updates for Flutter apps, powered by FireOTA.
///
/// ```dart
/// Future<void> main() async {
///   WidgetsFlutterBinding.ensureInitialized();
///   await FireOTA.init(const FireOTAConfig(appId: 'my-app', serverUrl: 'https://ota.example.com'));
///   runApp(const MyApp());
/// }
/// ```
library;

export 'src/config.dart';
export 'src/fireota.dart' show FireOTA, FireOTAUpdater, protocolVersion;
export 'src/models.dart';
export 'src/native.dart';
export 'src/signing.dart' show signatureMessage, publicKeyForPlatform;
export 'src/widgets.dart';
