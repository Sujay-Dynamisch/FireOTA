import 'dart:async';
import 'dart:convert';

import 'package:fireota/fireota.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _spki = '''-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt1ed6xww1H5tZkTSw9vj
8CUUbx+UIMJv0e+dJd83lOYEKyWUGb4TkwbPOEyEKnbmgN3u7p0vMCPrQpUMLgD+
XaznVtqQW5aH1iQZpQZVHE4NVuF79HDizK5d1BqKhUNU4CqoxQ82L4qmK4L1kWHo
mPVqDmLRPnNv0ZdanZu1JhE27jup5QMxbTfGyICnrJpBWXFQHEYfztHbelcUB/cR
RAzHY+WuN7mSRjZWOywZOzqtQsU3gekbLdrksKwkTHa8MHQlqyD2YFRw+6+FzMFw
v6WNiNjL7KtJse+WxCrbAdD+IYWJV8AB8vaMCIiv8HpM8Lnjd2Zss5PnyXol3nXj
dwIDAQAB
-----END PUBLIC KEY-----''';
const _pkcs1 =
    'MIIBCgKCAQEAt1ed6xww1H5tZkTSw9vj8CUUbx+UIMJv0e+dJd83lOYEKyWUGb4TkwbPOEyEKnbmgN3u7p0vMCPrQpUMLgD+XaznVtqQW5aH1iQZpQZVHE4NVuF79HDizK5d1BqKhUNU4CqoxQ82L4qmK4L1kWHomPVqDmLRPnNv0ZdanZu1JhE27jup5QMxbTfGyICnrJpBWXFQHEYfztHbelcUB/cRRAzHY+WuN7mSRjZWOywZOzqtQsU3gekbLdrksKwkTHa8MHQlqyD2YFRw+6+FzMFwv6WNiNjL7KtJse+WxCrbAdD+IYWJV8AB8vaMCIiv8HpM8Lnjd2Zss5PnyXol3nXjdwIDAQAB';

final _hash = 'a' * 64;
final _base = 'b' * 64;

class FakeNative implements FireOTANative {
  FakeNative([Map<String, Object?>? state])
      : state = {
          'platform': 'android',
          'installationId': 'install-1',
          'appVersion': '1.2.0',
          'buildNumber': '7',
          'abi': 'arm64-v8a',
          'baseFingerprint': 'b' * 64,
          ...?state,
        };

  final Map<String, Object?> state;
  final calls = <String>[];
  Map<String, Object?> markSuccessResult = const {'ok': true};
  PlatformException? downloadError;
  bool signatureValid = true;
  String? lastBuildId;
  String? lastPublicKey;
  bool? codePush;

  @override
  Future<NativeState> getState() async => NativeState(Map.of(state));
  @override
  Future<void> setCodePushEnabled(bool enabled) async => codePush = enabled;
  int? lastExpectedSize;
  int? lastMaxBytes;
  final progressEvents = StreamController<Map<String, Object?>>.broadcast();
  final progressSeen = <double?>[];

  @override
  Future<void> download({
    required String url,
    required String sha256,
    required String releaseId,
    int expectedSize = 0,
    int maxBytes = 0,
  }) async {
    calls.add('download:$releaseId');
    lastExpectedSize = expectedSize;
    lastMaxBytes = maxBytes;
    progressEvents.add({'releaseId': releaseId, 'received': 5, 'total': 10});
    await Future<void>.value();
    if (downloadError != null) throw downloadError!;
  }

  @override
  Stream<Map<String, Object?>> progress() => progressEvents.stream;

  @override
  Future<bool> verifySignature({required String message, required String signature, required String publicKey}) async {
    lastPublicKey = publicKey;
    return signatureValid;
  }

  @override
  Future<void> install(String releaseId) async {
    calls.add('install:$releaseId');
    state['pendingReleaseId'] = releaseId;
  }

  @override
  Future<Map<String, Object?>> markSuccess(String buildId) async {
    lastBuildId = buildId;
    calls.add('markSuccess');
    return markSuccessResult;
  }

  @override
  Future<void> clearPending() async => calls.add('clearPending');
  @override
  Future<void> clearFailed() async => calls.add('clearFailed');
  @override
  Future<String?> assetPath(String path) async => null;
  @override
  Future<String?> config() async => '{"theme":"dark"}';
  @override
  Future<void> restart() async => calls.add('restart');
}

/// A FireOTA server double: answers checks with [release] and records every event.
class FakeServer {
  Map<String, Object?>? release;
  String? reason;
  bool failChecks = false;
  final events = <Map<String, Object?>>[];
  final checks = <Map<String, Object?>>[];
  final sdkHeaders = <String?>{};
  Map<String, String> lastHeaders = const {};
  bool hugeReply = false;

  late final http.Client client = MockClient((request) async {
    final body = jsonDecode(request.body) as Map<String, Object?>;
    sdkHeaders.add(request.headers['x-fireota-sdk']);
    lastHeaders = request.headers;
    if (hugeReply) return http.Response('x' * (1024 * 1024 + 1), 200);
    if (request.url.path.endsWith('/updates/events')) {
      events.add(body);
      return http.Response(jsonEncode({'success': true, 'data': {}}), 200);
    }
    checks.add(body);
    if (failChecks) {
      return http.Response(jsonEncode({'success': false, 'error': {'code': 'X', 'message': 'server down'}}), 500);
    }
    return http.Response(
      jsonEncode({
        'success': true,
        'data': release == null ? {'updateAvailable': false, 'reason': reason ?? 'up_to_date'} : {'updateAvailable': true, 'release': release},
      }),
      200,
    );
  });

  List<String> get eventNames => events.map((e) => '${e['event']}:${(e['metadata'] as Map?)?['reason'] ?? ''}').toList();
}

Map<String, Object?> release({
  String id = 'rel-1',
  String runtime = '1.2.0+7',
  bool code = false,
  Map<String, String>? base,
  String? signature,
}) =>
    {
      'id': id,
      'version': '1',
      'runtimeVersion': runtime,
      'mandatory': false,
      'notes': 'Fixes',
      'bundle': {'url': 'https://cdn.example.com/u.fota', 'hash': _hash, 'size': 10},
      if (signature != null) 'signature': {'value': signature, 'algorithm': 'rsa-v1_5-sha256'},
      'manifest': code
          ? {'format': 'flutter-aot', 'flutter': {'kind': 'flutter-aot', 'base': base ?? {'arm64-v8a': _base}}}
          : {'format': 'flutter-assets', 'flutter': {'kind': 'flutter-assets'}},
    };

Future<(FireOTAUpdater, FakeNative, FakeServer)> start(
  WidgetTester tester, {
  Map<String, Object?>? nativeState,
  bool allowCodePush = false,
  String? certificate,
  String platform = 'android',
  void Function(FakeNative native, FakeServer server)? arrange,
  Map<String, String> headers = const {},
  void Function(FireOTAEvent event)? onEvent,
  int maxDownloadBytes = 200 * 1024 * 1024,
  Duration minCheckInterval = const Duration(minutes: 10),
}) async {
  final native = FakeNative(nativeState);
  final server = FakeServer();
  arrange?.call(native, server);
  final updater = FireOTAUpdater(native: native, httpClient: server.client, buildId: 'build-1', platform: platform);
  addTearDown(updater.dispose);
  await updater.init(FireOTAConfig(
    appId: 'app',
    serverUrl: 'https://ota.example.com/',
    checkOnAppStart: false,
    allowCodePush: allowCodePush,
    codeSigningCertificate: certificate,
    headers: headers,
    onEvent: onEvent,
    maxDownloadBytes: maxDownloadBytes,
    minCheckInterval: minCheckInterval,
  ));
  await tester.pump();
  await tester.pump();
  return (updater, native, server);
}

/// Lets unawaited telemetry requests finish, then renders a frame.
Future<void> settle(WidgetTester tester) async {
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
  await tester.pump();
}

void main() {
  group('launch', () {
    testWidgets('uses <version>+<build> as the runtime and confirms after the first frame', (tester) async {
      final (updater, native, _) = await start(tester, allowCodePush: true);
      expect(updater.state.value.runtimeVersion, '1.2.0+7');
      expect(updater.config, {'theme': 'dark'});
      expect(native.codePush, isTrue);
      expect(native.lastBuildId, 'build-1');
    });

    testWidgets('never enables code push on iOS', (tester) async {
      final (_, native, _) = await start(tester, allowCodePush: true, platform: 'ios');
      expect(native.codePush, isFalse);
    });

    testWidgets('reports a patch confirmed on its first launch', (tester) async {
      final (_, _, server) = await start(tester, nativeState: {'currentReleaseId': 'rel-1', 'isFirstRun': true});
      await settle(tester);
      expect(server.eventNames, ['install_succeeded:']);
      expect(server.events.single['eventId'], 'install_succeeded:rel-1:install-1');
    });

    testWidgets('reports a patch that crashed before confirming', (tester) async {
      final (_, native, server) = await start(tester, nativeState: {'failedReleaseId': 'rel-0', 'failedReason': 'launch_not_confirmed'});
      await settle(tester);
      expect(server.eventNames, containsAll(['rollback:launch_not_confirmed', 'install_failed:launch_not_confirmed']));
      expect(native.calls, contains('clearFailed'));
    });

    testWidgets('reports a code patch the engine did not load', (tester) async {
      final (_, _, server) = await start(
        tester,
        nativeState: {'currentReleaseId': 'rel-2', 'isFirstRun': true},
        arrange: (native, _) => native.markSuccessResult = {'ok': false, 'releaseId': 'rel-2', 'reason': 'patch_not_loaded'},
      );
      await settle(tester);
      expect(server.eventNames, containsAll(['rollback:patch_not_loaded', 'install_failed:patch_not_loaded']));
      expect(server.eventNames, isNot(contains('install_succeeded:')));
    });
  });

  group('checking for updates', () {
    Future<String?> refusal(WidgetTester tester, Map<String, Object?> offered,
        {bool allowCodePush = true, Map<String, Object?>? nativeState, String platform = 'android'}) async {
      final (updater, _, server) = await start(tester, allowCodePush: allowCodePush, nativeState: nativeState, platform: platform);
      server.release = offered;
      final result = await updater.checkForUpdate();
      return result.updateAvailable ? null : result.reason;
    }

    testWidgets('sends the device identity', (tester) async {
      final (updater, _, server) = await start(tester, nativeState: {'currentReleaseId': 'rel-0'});
      await updater.checkForUpdate();
      expect(server.checks.single, containsPair('runtimeVersion', '1.2.0+7'));
      expect(server.checks.single, containsPair('platform', 'android'));
      expect(server.checks.single, containsPair('currentReleaseId', 'rel-0'));
      expect(server.sdkHeaders, {'flutter/1'});
    });

    testWidgets('accepts an update for this exact build', (tester) async {
      expect(await refusal(tester, release(code: true)), isNull);
    });

    testWidgets('refuses another build number of the same version', (tester) async {
      expect(await refusal(tester, release(runtime: '1.2.0+8')), 'runtime_incompatible');
    });

    testWidgets('refuses a patch that failed here before', (tester) async {
      expect(await refusal(tester, release(), nativeState: {'blockedReleaseIds': ['rel-1']}), 'blocked');
    });

    testWidgets('refuses code patches unless code push is allowed', (tester) async {
      expect(await refusal(tester, release(code: true), allowCodePush: false), 'code_push_disabled');
    });

    testWidgets('refuses code patches on iOS', (tester) async {
      expect(await refusal(tester, release(code: true), platform: 'ios'), 'unsupported_platform');
    });

    testWidgets('refuses a code patch built for another store build', (tester) async {
      expect(await refusal(tester, release(code: true, base: {'arm64-v8a': 'c' * 64})), 'base_mismatch');
    });

    testWidgets('refuses a code patch without code for this ABI', (tester) async {
      expect(await refusal(tester, release(code: true, base: {'x86_64': _base})), 'abi_unsupported');
    });
  });

  group('downloading', () {
    testWidgets('refuses unsigned code patches when no certificate is configured', (tester) async {
      final (updater, native, server) = await start(tester, allowCodePush: true);
      final offered = FireOTARelease.fromJson(release(code: true));
      await expectLater(updater.downloadUpdate(offered), throwsStateError);
      await settle(tester);
      expect(native.calls, isNot(contains('download:rel-1')));
      expect(server.eventNames, contains('install_failed:signing_not_configured'));
    });

    testWidgets('refuses an invalid signature', (tester) async {
      final (updater, native, server) = await start(
        tester,
        allowCodePush: true,
        certificate: _spki,
        arrange: (native, _) => native.signatureValid = false,
      );
      await expectLater(updater.downloadUpdate(FireOTARelease.fromJson(release(code: true, signature: 'c2ln'))), throwsStateError);
      await settle(tester);
      expect(native.calls, isNot(contains('download:rel-1')));
      expect(server.eventNames, contains('install_failed:signature_invalid'));
    });

    testWidgets('downloads a signed code patch', (tester) async {
      final (updater, native, server) = await start(tester, allowCodePush: true, certificate: _spki);
      await updater.downloadUpdate(FireOTARelease.fromJson(release(code: true, signature: 'c2ln')));
      await settle(tester);
      expect(native.calls, contains('download:rel-1'));
      expect(server.eventNames, ['download_started:', 'download_completed:']);
    });

    testWidgets('reports the native refusal code', (tester) async {
      final (updater, _, server) = await start(
        tester,
        arrange: (native, _) => native.downloadError = PlatformException(code: 'checksum_mismatch', message: 'bad'),
      );
      await expectLater(updater.downloadUpdate(FireOTARelease.fromJson(release())), throwsA(isA<PlatformException>()));
      await settle(tester);
      expect(server.eventNames, contains('install_failed:checksum_mismatch'));
    });
  });

  group('sync', () {
    testWidgets('downloads and installs an asset update for the next start', (tester) async {
      final (updater, native, _) = await start(tester, arrange: (_, server) => server.release = release());
      final result = await updater.sync();
      expect(result.updateAvailable, isTrue);
      expect(native.calls, containsAllInOrder(['download:rel-1', 'install:rel-1']));
      expect(native.calls, isNot(contains('restart')));
      expect(updater.state.value.status, UpdateStatus.installed);
      expect(updater.state.value.pendingReleaseId, 'rel-1');
    });

    testWidgets('never throws: a server error becomes the error status', (tester) async {
      final (updater, _, _) = await start(tester, arrange: (_, server) => server.failChecks = true);
      final result = await updater.sync();
      expect(result.reason, 'error');
      expect(updater.state.value.status, UpdateStatus.error);
      expect(updater.state.value.error, contains('server down'));
    });
  });

  group('security', () {
    Future<Object?> initError(String serverUrl, {bool allowInsecureServer = false, String? certificate}) async {
      final updater = FireOTAUpdater(native: FakeNative(), httpClient: FakeServer().client, buildId: 'b', platform: 'android');
      try {
        await updater.init(FireOTAConfig(
          appId: 'app',
          serverUrl: serverUrl,
          checkOnAppStart: false,
          checkOnResume: false,
          allowInsecureServer: allowInsecureServer,
          codeSigningCertificate: certificate,
        ));
        return null;
      } catch (error) {
        return error;
      }
    }

    testWidgets('requires an https server URL', (tester) async {
      expect(await initError('http://ota.example.com'), isArgumentError);
      expect(await initError('not a url'), isArgumentError);
      expect(await initError('ftp://ota.example.com'), isArgumentError);
      expect(await initError('https://ota.example.com'), isNull);
    });

    testWidgets('allows http only when asked to, outside release builds', (tester) async {
      expect(await initError('http://10.0.2.2:8080', allowInsecureServer: true), isNull);
    });

    testWidgets('rejects a malformed signing certificate at startup', (tester) async {
      expect(await initError('https://ota.example.com', certificate: '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----'), isArgumentError);
      expect(await initError('https://ota.example.com', certificate: _spki), isNull);
    });

    testWidgets('refuses updates larger than maxDownloadBytes before downloading', (tester) async {
      final (updater, native, server) = await start(tester, maxDownloadBytes: 5, arrange: (_, server) => server.release = release());
      expect((await updater.checkForUpdate()).reason, 'too_large');
      await expectLater(updater.downloadUpdate(FireOTARelease.fromJson(release())), throwsStateError);
      await settle(tester);
      expect(native.calls, isNot(contains('download:rel-1')));
      expect(server.eventNames, contains('install_failed:too_large'));
    });

    testWidgets('passes the declared size and the cap to the native download', (tester) async {
      final (updater, native, _) = await start(tester, maxDownloadBytes: 1000);
      await updater.downloadUpdate(FireOTARelease.fromJson(release()));
      expect(native.lastExpectedSize, 10);
      expect(native.lastMaxBytes, 1000);
    });

    testWidgets('refuses a non-HTTPS download URL', (tester) async {
      final (updater, native, _) = await start(tester);
      final insecure = release()..['bundle'] = {'url': 'http://cdn.example.com/u.fota', 'hash': _hash, 'size': 10};
      await expectLater(updater.downloadUpdate(FireOTARelease.fromJson(insecure)), throwsStateError);
      expect(native.calls, isNot(contains('download:rel-1')));
    });

    testWidgets('refuses an oversized server reply', (tester) async {
      final (updater, _, _) = await start(tester, arrange: (_, server) => server.hugeReply = true);
      final result = await updater.sync();
      expect(result.reason, 'error');
      expect(updater.state.value.error, contains('too large'));
    });
  });

  group('hooks and lifecycle', () {
    testWidgets('sends custom headers without replacing the SDK headers', (tester) async {
      final (updater, _, server) = await start(
        tester,
        headers: {'x-api-gateway': 'k1', 'x-fireota-sdk': 'spoofed', 'content-type': 'text/plain'},
      );
      await updater.checkForUpdate();
      expect(server.lastHeaders['x-api-gateway'], 'k1');
      expect(server.lastHeaders['x-fireota-sdk'], 'flutter/1');
      expect(server.lastHeaders['content-type'], startsWith('application/json'));
    });

    testWidgets('forwards every event to onEvent, even when the server is down', (tester) async {
      final seen = <FireOTAEvent>[];
      final (_, _, _) = await start(
        tester,
        nativeState: {'failedReleaseId': 'rel-0', 'failedReason': 'patch_not_loaded'},
        onEvent: seen.add,
        arrange: (_, server) => server.failChecks = true,
      );
      await settle(tester);
      expect(seen.map((e) => '${e.name}:${e.metadata['reason']}'), containsAll(['rollback:patch_not_loaded', 'install_failed:patch_not_loaded']));
      expect(seen.first.releaseId, 'rel-0');
    });

    testWidgets('reports download progress, then clears it', (tester) async {
      final (updater, native, _) = await start(tester);
      updater.state.addListener(() => native.progressSeen.add(updater.state.value.downloadProgress));
      await updater.downloadUpdate(FireOTARelease.fromJson(release()));
      expect(native.progressSeen, contains(0.5));
      expect(updater.state.value.downloadProgress, isNull);
    });

    testWidgets('checks again when the app returns to the foreground, at most once per interval', (tester) async {
      final (_, _, server) = await start(tester);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await settle(tester);
      expect(server.checks, hasLength(1));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await settle(tester);
      expect(server.checks, hasLength(1));
    });
  });

  group('signing helpers', () {
    test('signs the same message as the CLI and server', () {
      expect(signatureMessage('1.2.0+7', 'android', 'ABC'), 'fireota-update-v1\n1.2.0+7\nandroid\nabc');
    });

    test('passes the SubjectPublicKeyInfo to Android and the PKCS#1 key to iOS', () {
      final spkiBody = _spki.replaceAll(RegExp(r'-----[^-]+-----|\s'), '');
      expect(publicKeyForPlatform(_spki, 'android'), spkiBody);
      expect(publicKeyForPlatform(_spki, 'ios'), _pkcs1);
    });

    test('rejects a malformed certificate', () {
      expect(() => publicKeyForPlatform('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----', 'ios'), throwsFormatException);
    });
  });
}
