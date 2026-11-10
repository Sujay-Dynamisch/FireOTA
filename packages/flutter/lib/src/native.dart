import 'package:flutter/services.dart';

import 'models.dart';

/// The platform side of the SDK. Replace it in tests with a fake.
abstract class FireOTANative {
  Future<NativeState> getState();
  Future<void> setCodePushEnabled(bool enabled);

  /// Downloads, verifies the SHA-256 and unpacks a patch. Throws [PlatformException] with a
  /// stable `code` (checksum_mismatch, base_mismatch, abi_unsupported, blocked, ...).
  Future<void> download({required String url, required String sha256, required String releaseId});
  Future<bool> verifySignature({required String message, required String signature, required String publicKey});
  Future<void> install(String releaseId);

  /// Confirms this launch. Returns `{ok: false, releaseId, reason}` when the patch was rolled back.
  Future<Map<String, Object?>> markSuccess(String buildId);
  Future<void> clearPending();
  Future<void> clearFailed();
  Future<String?> assetPath(String path);
  Future<String?> config();
  Future<void> restart();
}

class MethodChannelFireOTANative implements FireOTANative {
  MethodChannelFireOTANative([MethodChannel? channel]) : _channel = channel ?? const MethodChannel('dev.fireota/flutter');

  final MethodChannel _channel;

  @override
  Future<NativeState> getState() async =>
      NativeState(await _channel.invokeMapMethod<Object?, Object?>('getState') ?? const {});

  @override
  Future<void> setCodePushEnabled(bool enabled) => _channel.invokeMethod('setCodePushEnabled', {'enabled': enabled});

  @override
  Future<void> download({required String url, required String sha256, required String releaseId}) =>
      _channel.invokeMethod('download', {'url': url, 'sha256': sha256, 'releaseId': releaseId});

  @override
  Future<bool> verifySignature({required String message, required String signature, required String publicKey}) async =>
      await _channel.invokeMethod<bool>('verifySignature', {'message': message, 'signature': signature, 'publicKey': publicKey}) ??
      false;

  @override
  Future<void> install(String releaseId) => _channel.invokeMethod('install', {'releaseId': releaseId});

  @override
  Future<Map<String, Object?>> markSuccess(String buildId) async =>
      (await _channel.invokeMapMethod<String, Object?>('markSuccess', {'buildId': buildId})) ?? const {'ok': true};

  @override
  Future<void> clearPending() => _channel.invokeMethod('clearPending');

  @override
  Future<void> clearFailed() => _channel.invokeMethod('clearFailed');

  @override
  Future<String?> assetPath(String path) => _channel.invokeMethod<String>('assetPath', {'path': path});

  @override
  Future<String?> config() => _channel.invokeMethod<String>('config');

  @override
  Future<void> restart() => _channel.invokeMethod('restart');
}
