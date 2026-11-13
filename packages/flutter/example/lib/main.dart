import 'package:fireota/fireota.dart';
// material.dart is deprecated in newer Flutter, but package:material_ui does not exist in the
// older versions this package supports (Flutter 3.22+).
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

// Pass these at build time, or let `fireota init` write them into lib/fireota_config.dart:
//   flutter run --dart-define=FIREOTA_APP_ID=my-app --dart-define=FIREOTA_URL=https://ota.example.com
const appId = String.fromEnvironment('FIREOTA_APP_ID', defaultValue: 'example-app');
const serverUrl = String.fromEnvironment('FIREOTA_URL', defaultValue: 'https://fireota.example.com');
const certificate = String.fromEnvironment('FIREOTA_CERTIFICATE');

/// Change this text, run `fireota patch android`, and restart the app twice to see code push.
const message = 'Hello from the store build';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await FireOTA.init(const FireOTAConfig(
    appId: appId,
    serverUrl: serverUrl,
    allowCodePush: true,
    codeSigningCertificate: certificate == '' ? null : certificate,
  ));
  runApp(const ExampleApp());
}

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FireOTA example',
      theme: ThemeData(colorSchemeSeed: const Color(0xFFD84315), useMaterial3: true),
      home: Scaffold(
        appBar: AppBar(title: const Text('FireOTA example')),
        body: Column(
          children: [
            const FireOTAUpdateBanner(),
            Expanded(
              child: Center(
                child: FireOTABuilder(
                  builder: (context, state) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(message, style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 16),
                      Text('Runtime ${state.runtimeVersion ?? '…'}'),
                      Text('Running ${state.currentReleaseId ?? 'the store build'}'),
                      Text('Status: ${state.status.name}${state.error != null ? ' (${state.error})' : ''}'),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: FireOTA.sync, child: const Text('Check for updates')),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
