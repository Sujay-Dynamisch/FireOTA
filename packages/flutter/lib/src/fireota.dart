import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';
import 'native.dart';
import 'signing.dart';

/// Wire protocol version, sent as `x-fireota-sdk: flutter/<version>`.
const protocolVersion = 1;

/// Compiled into every build by `fireota release` and `fireota patch`
/// (`--dart-define=FIREOTA_BUILD_ID=...`). The running code reports it so the device can prove
/// a code patch really loaded: if it could not, Flutter quietly runs the store build instead.
const _compiledBuildId = String.fromEnvironment('FIREOTA_BUILD_ID');

/// Static entry points. `await FireOTA.init(...)` once, after `WidgetsFlutterBinding.ensureInitialized()`.
abstract final class FireOTA {
  static FireOTAUpdater _instance = FireOTAUpdater();

  /// The updater behind the static API.
  static FireOTAUpdater get instance => _instance;

  /// Replaces the updater, for tests.
  @visibleForTesting
  static set instance(FireOTAUpdater value) => _instance = value;

  static Future<void> init(FireOTAConfig config) => _instance.init(config);
  static ValueListenable<FireOTASnapshot> get state => _instance.state;
  static Future<CheckResult> checkForUpdate() => _instance.checkForUpdate();
  static Future<void> downloadUpdate(FireOTARelease release) => _instance.downloadUpdate(release);
  static Future<void> installUpdate(FireOTARelease release, {InstallMode mode = InstallMode.nextRestart}) =>
      _instance.installUpdate(release, mode: mode);
  static Future<CheckResult> sync() => _instance.sync();
  static Future<void> restart() => _instance.restart();
  static Future<void> clearPendingUpdate() => _instance.clearPendingUpdate();
  static Map<String, Object?> get config => _instance.config;
  static Future<File?> assetFile(String path) => _instance.assetFile(path);
}

/// Largest server reply the SDK reads; update metadata is a few KB.
const _maxResponseBytes = 1024 * 1024;

/// The updater. Use [FireOTA] unless you need several instances (tests).
class FireOTAUpdater with WidgetsBindingObserver {
  FireOTAUpdater({FireOTANative? native, http.Client? httpClient, String? buildId, String? platform})
      : _native = native ?? MethodChannelFireOTANative(),
        _http = httpClient ?? http.Client(),
        _buildId = buildId ?? _compiledBuildId,
        _platform = platform;

  final FireOTANative _native;
  final http.Client _http;
  final String _buildId;
  final String? _platform;

  late FireOTAConfig _config;
  late String _runtimeVersion;
  NativeState? _device;
  Future<void>? _initializing;
  Future<CheckResult>? _running;
  Map<String, Object?> _remoteConfig = const {};

  final ValueNotifier<FireOTASnapshot> _state = ValueNotifier(const FireOTASnapshot());

  ValueListenable<FireOTASnapshot> get state => _state;

  /// Remote config from the current asset update (`config.json`), or empty.
  Map<String, Object?> get config => _remoteConfig;

  String get _os => _platform ?? (Platform.isIOS ? 'ios' : 'android');

  /// Configures the SDK. Safe to call more than once: the first call wins.
  Future<void> init(FireOTAConfig config) {
    return _initializing ??= _init(config).catchError((Object error) {
      _initializing = null;
      throw error;
    });
  }

  Future<void> _init(FireOTAConfig config) async {
    if (config.appId.isEmpty || config.serverUrl.isEmpty) {
      throw ArgumentError('FireOTA.init needs appId and serverUrl.');
    }
    // Update metadata decides what code runs: never fetch it over plain HTTP in a release build.
    final server = Uri.tryParse(config.serverUrl);
    final insecureAllowed = config.allowInsecureServer && !kReleaseMode;
    if (server == null || !server.hasAuthority || (server.scheme != 'https' && !(insecureAllowed && server.scheme == 'http'))) {
      throw ArgumentError('FireOTA serverUrl must be an https:// URL (got ${config.serverUrl}).');
    }
    // Fail at startup rather than refusing every update later.
    final certificate = config.codeSigningCertificate;
    if (certificate != null && certificate.isNotEmpty) {
      try {
        publicKeyForPlatform(certificate, 'ios');
      } on Object {
        throw ArgumentError('FireOTA codeSigningCertificate is not a valid PEM public key.');
      }
    }
    _config = config;
    await _native.setCodePushEnabled(config.allowCodePush && _os == 'android');
    final device = await _native.getState();
    _device = device;
    _runtimeVersion = config.runtimeVersion ??
        (device.buildNumber.isEmpty ? device.appVersion : '${device.appVersion}+${device.buildNumber}');
    if (_runtimeVersion.isEmpty) throw StateError('FireOTA could not read the app version; pass runtimeVersion.');

    _state.value = _state.value.copyWith(
      configured: true,
      runtimeVersion: _runtimeVersion,
      channel: config.channel,
      appVersion: device.appVersion,
      currentReleaseId: () => device.currentReleaseId,
      pendingReleaseId: () => device.pendingReleaseId,
    );
    await _loadRemoteConfig();

    if (device.failedReleaseId != null) {
      final reason = device.failedReason ?? 'launch_not_confirmed';
      unawaited(_report('rollback', device.failedReleaseId!, {'reason': reason}));
      unawaited(_report('install_failed', device.failedReleaseId!, {'reason': reason}));
      await _native.clearFailed();
    }

    // Reaching the first frame proves the code starts; a patch that crashes before it is rolled
    // back on the next launch. Updates are only checked after that.
    final binding = WidgetsFlutterBinding.ensureInitialized();
    binding.addPostFrameCallback((_) => unawaited(_confirmLaunch(device)));
    binding.scheduleFrame();
  }

  Future<void> _confirmLaunch(NativeState device) async {
    try {
      final result = await _native.markSuccess(_buildId);
      if (result['ok'] == false) {
        final releaseId = '${result['releaseId']}';
        final reason = '${result['reason'] ?? 'patch_not_loaded'}';
        unawaited(_report('rollback', releaseId, {'reason': reason}));
        unawaited(_report('install_failed', releaseId, {'reason': reason}));
        await _native.clearFailed();
        await _refreshDevice();
      } else if (device.isFirstRun && device.currentReleaseId != null) {
        unawaited(_report('install_succeeded', device.currentReleaseId!));
      }
    } catch (error) {
      debugPrint('FireOTA: could not confirm this launch: $error');
    }
    if (_config.checkOnAppStart) unawaited(sync());
    if (_config.checkOnResume) WidgetsBinding.instance.addObserver(this);
  }

  DateTime? _lastSyncAt;

  /// Stops listening for app lifecycle changes. Only needed for updaters you create yourself.
  void dispose() => WidgetsBinding.instance.removeObserver(this);

  /// Checks again when the app comes back to the foreground, at most once per minCheckInterval.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    final last = _lastSyncAt;
    if (last != null && DateTime.now().difference(last) < _config.minCheckInterval) return;
    unawaited(sync());
  }

  /// Asks FireOTA whether a compatible update exists for this device.
  Future<CheckResult> checkForUpdate() async {
    _requireInit();
    final device = await _refreshDevice();
    _setStatus(UpdateStatus.checking);
    final data = await _post('/api/public/v1/updates/check', {
      'app': _config.appId,
      'channel': _config.channel,
      'platform': _os,
      'installationId': device.installationId,
      'runtimeVersion': _runtimeVersion,
      'nativeVersion': device.appVersion,
      'appVersion': device.appVersion,
      if ((device.pendingReleaseId ?? device.currentReleaseId) != null)
        'currentReleaseId': device.pendingReleaseId ?? device.currentReleaseId,
    });
    final available = data['updateAvailable'] == true && data['release'] is Map;
    var result = CheckResult(
      updateAvailable: available,
      reason: data['reason'] as String?,
      release: available ? FireOTARelease.fromJson((data['release'] as Map).cast<String, Object?>()) : null,
    );
    final refusal = result.release == null ? null : _refusalFor(result.release!, device);
    if (refusal != null) result = CheckResult(updateAvailable: false, reason: refusal);

    _state.value = _state.value.copyWith(available: () => result.release, lastCheckedAt: DateTime.now());
    if (!result.updateAvailable) _setStatus(UpdateStatus.upToDate);
    return result;
  }

  /// Defence in depth: refuse anything this exact build cannot run, before downloading it.
  String? _refusalFor(FireOTARelease release, NativeState device) {
    if (release.runtimeVersion != _runtimeVersion) return 'runtime_incompatible';
    if (device.blockedReleaseIds.contains(release.id)) return 'blocked';
    if (release.bundleSize > _config.maxDownloadBytes) return 'too_large';
    if (release.kind == PatchKind.code) {
      if (_os != 'android') return 'unsupported_platform';
      if (!_config.allowCodePush) return 'code_push_disabled';
      final expected = release.baseFingerprints[device.abi];
      if (expected == null) return 'abi_unsupported';
      if (expected.toLowerCase() != device.baseFingerprint.toLowerCase()) return 'base_mismatch';
    }
    return null;
  }

  /// Verifies the signature, then downloads and checks the update. The running code is untouched.
  Future<void> downloadUpdate(FireOTARelease release) async {
    _requireInit();
    if (!RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(release.bundleHash)) {
      throw StateError('The update has no valid checksum.');
    }
    if (!release.bundleUrl.startsWith('https://')) throw StateError('Updates must be downloaded over HTTPS.');
    if (release.bundleSize > _config.maxDownloadBytes) {
      unawaited(_report('install_failed', release.id, {'reason': 'too_large'}));
      throw StateError('The update is larger than maxDownloadBytes.');
    }
    await _assertSigned(release);
    _setStatus(UpdateStatus.downloading, releaseId: release.id);
    unawaited(_report('download_started', release.id));
    final progress = _native.progress().where((event) => event['releaseId'] == release.id).listen((event) {
      final received = (event['received'] as num?)?.toDouble() ?? 0;
      final total = (event['total'] as num?)?.toDouble() ?? release.bundleSize.toDouble();
      if (total > 0) _state.value = _state.value.copyWith(downloadProgress: () => (received / total).clamp(0.0, 1.0));
    });
    try {
      await _native.download(
        url: release.bundleUrl,
        sha256: release.bundleHash.toLowerCase(),
        releaseId: release.id,
        expectedSize: release.bundleSize,
        maxBytes: _config.maxDownloadBytes,
      );
    } on PlatformException catch (error) {
      unawaited(_report('install_failed', release.id, {'reason': error.code}));
      rethrow;
    } finally {
      // Not awaited: an event channel cancel round-trips to the platform and nothing depends on it.
      unawaited(progress.cancel());
      _state.value = _state.value.copyWith(downloadProgress: () => null);
    }
    unawaited(_report('download_completed', release.id));
    _setStatus(UpdateStatus.downloaded, releaseId: release.id);
  }

  Future<void> _assertSigned(FireOTARelease release) async {
    final certificate = _config.codeSigningCertificate;
    if (certificate == null || certificate.isEmpty) {
      if (release.kind == PatchKind.code) {
        unawaited(_report('install_failed', release.id, {'reason': 'signing_not_configured'}));
        throw StateError('Code patches must be signed: set codeSigningCertificate in FireOTAConfig.');
      }
      return;
    }
    final signature = release.signature;
    var valid = false;
    if (signature != null && signature.isNotEmpty) {
      try {
        valid = await _native.verifySignature(
          message: signatureMessage(_runtimeVersion, _os, release.bundleHash),
          signature: signature,
          publicKey: publicKeyForPlatform(certificate, _os),
        );
      } on FormatException {
        valid = false;
      }
    }
    if (!valid) {
      unawaited(_report('install_failed', release.id, {'reason': signature == null ? 'unsigned' : 'signature_invalid'}));
      throw StateError(
        signature == null
            ? 'The update is not signed; this app only accepts signed updates.'
            : 'The update signature is not valid for this app.',
      );
    }
  }

  /// Applies a downloaded update on the next start, or now with [InstallMode.immediate].
  Future<void> installUpdate(FireOTARelease release, {InstallMode mode = InstallMode.nextRestart}) async {
    await _native.install(release.id);
    _state.value = _state.value.copyWith(pendingReleaseId: () => release.id);
    _setStatus(UpdateStatus.installed, releaseId: release.id);
    if (mode == InstallMode.immediate) await restart();
  }

  /// Check, download and install in one call, honouring the configured install modes.
  /// Never throws: the app keeps running the code it already has.
  Future<CheckResult> sync() {
    return _running ??= () async {
      _lastSyncAt = DateTime.now();
      try {
        final result = await checkForUpdate();
        final release = result.release;
        if (result.updateAvailable && release != null) {
          await downloadUpdate(release);
          await installUpdate(release, mode: release.mandatory ? _config.mandatoryInstallMode : _config.installMode);
        }
        return result;
      } catch (error) {
        _setStatus(UpdateStatus.error, error: error is PlatformException ? (error.message ?? error.code) : '$error');
        return const CheckResult(updateAvailable: false, reason: 'error');
      } finally {
        _running = null;
      }
    }();
  }

  /// Applies a pending update now: a cold restart on Android; on iOS assets and config switch in place.
  Future<void> restart() async {
    await _native.restart();
    if (_os == 'ios') {
      final device = await _refreshDevice();
      await _loadRemoteConfig();
      _state.value = _state.value.copyWith(
        currentReleaseId: () => device.currentReleaseId,
        pendingReleaseId: () => null,
        revision: _state.value.revision + 1,
      );
    }
  }

  /// Drops a downloaded update that has not applied yet.
  Future<void> clearPendingUpdate() async {
    await _native.clearPending();
    _state.value = _state.value.copyWith(pendingReleaseId: () => null);
  }

  /// A file from the current asset update, or null when the update does not replace [path].
  Future<File?> assetFile(String path) async {
    final found = await _native.assetPath(path);
    return found == null ? null : File(found);
  }

  Future<void> _loadRemoteConfig() async {
    final raw = await _native.config();
    try {
      _remoteConfig = raw == null ? const {} : (jsonDecode(raw) as Map).cast<String, Object?>();
    } catch (_) {
      _remoteConfig = const {};
    }
  }

  Future<NativeState> _refreshDevice() async {
    final device = await _native.getState();
    _device = device;
    _state.value = _state.value.copyWith(
      currentReleaseId: () => device.currentReleaseId,
      pendingReleaseId: () => device.pendingReleaseId,
    );
    return device;
  }

  void _requireInit() {
    if (_initializing == null) throw StateError('Call FireOTA.init() before using the SDK.');
  }

  void _setStatus(UpdateStatus status, {String? releaseId, String? error}) {
    _state.value = _state.value.copyWith(
      status: status,
      error: () => status == UpdateStatus.error ? (error ?? 'Update failed') : null,
    );
    _config.onStatusChange?.call(status, releaseId: releaseId, error: error);
  }

  Future<Map<String, Object?>> _post(String path, Map<String, Object?> body) async {
    final base = _config.serverUrl.replaceAll(RegExp(r'/+$'), '');
    final response = await _http
        .post(
          Uri.parse('$base$path'),
          headers: {
            ..._config.headers,
            'content-type': 'application/json',
            'x-fireota-sdk': 'flutter/$protocolVersion',
          },
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    if (response.bodyBytes.length > _maxResponseBytes) throw StateError('The FireOTA server reply is too large.');
    final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>;
    if (json['success'] != true) {
      final error = (json['error'] as Map?)?.cast<String, Object?>();
      throw StateError('${error?['message'] ?? 'FireOTA request failed (${response.statusCode})'}');
    }
    return ((json['data'] as Map?) ?? const {}).cast<String, Object?>();
  }

  /// Telemetry never blocks or fails an update.
  Future<void> _report(String event, String releaseId, [Map<String, Object?>? metadata]) async {
    try {
      _config.onEvent?.call(FireOTAEvent(name: event, releaseId: releaseId, metadata: metadata ?? const {}));
    } catch (error) {
      debugPrint('FireOTA: onEvent threw: $error');
    }
    try {
      final device = _device ?? await _native.getState();
      await _post('/api/public/v1/updates/events', {
        'app': _config.appId,
        'releaseId': releaseId,
        'platform': _os,
        'installationId': device.installationId,
        'runtimeVersion': _runtimeVersion,
        'nativeVersion': device.appVersion,
        'appVersion': device.appVersion,
        'event': event,
        'eventId': '$event:$releaseId:${device.installationId}',
        if (metadata != null) 'metadata': metadata,
      });
    } catch (_) {
      // ignored by design
    }
  }
}
