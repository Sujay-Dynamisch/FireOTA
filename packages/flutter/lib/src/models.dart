/// Where the updater is in its lifecycle.
enum UpdateStatus { idle, checking, upToDate, downloading, downloaded, installed, error }

/// The two kinds of Flutter update the FireOTA CLI builds.
enum PatchKind {
  /// Compiled Dart code (`fireota patch android`). Android only.
  code,

  /// Assets and remote config (`fireota publish --flutter-assets`). Android and iOS.
  assets,
}

/// An update offered by the server.
class FireOTARelease {
  const FireOTARelease({
    required this.id,
    required this.version,
    required this.runtimeVersion,
    required this.mandatory,
    required this.notes,
    required this.bundleUrl,
    required this.bundleHash,
    required this.bundleSize,
    this.signature,
    this.manifest = const {},
  });

  factory FireOTARelease.fromJson(Map<String, Object?> json) {
    final bundle = (json['bundle'] as Map?)?.cast<String, Object?>() ?? const {};
    final signature = (json['signature'] as Map?)?.cast<String, Object?>();
    return FireOTARelease(
      id: json['id'] as String? ?? '',
      version: json['version'] as String? ?? '',
      runtimeVersion: json['runtimeVersion'] as String? ?? '',
      mandatory: json['mandatory'] == true,
      notes: (json['notes'] ?? json['message']) as String? ?? '',
      bundleUrl: bundle['url'] as String? ?? '',
      bundleHash: bundle['hash'] as String? ?? '',
      bundleSize: (bundle['size'] as num?)?.toInt() ?? 0,
      signature: signature?['value'] as String?,
      manifest: (json['manifest'] as Map?)?.cast<String, Object?>() ?? const {},
    );
  }

  final String id;
  final String version;
  final String runtimeVersion;
  final bool mandatory;
  final String notes;
  final String bundleUrl;
  final String bundleHash;
  final int bundleSize;

  /// Base64 RSA signature, when the update was signed.
  final String? signature;

  /// Server manifest. Flutter updates carry their `fireota.json` descriptor under `flutter`.
  final Map<String, Object?> manifest;

  Map<String, Object?> get descriptor => (manifest['flutter'] as Map?)?.cast<String, Object?>() ?? const {};

  PatchKind get kind => manifest['format'] == 'flutter-aot' || descriptor['kind'] == 'flutter-aot' ? PatchKind.code : PatchKind.assets;

  /// Base fingerprint per ABI that a code patch was compiled against.
  Map<String, String> get baseFingerprints =>
      ((descriptor['base'] as Map?) ?? const {}).map((key, value) => MapEntry('$key', '$value'));
}

/// The answer to an update check.
class CheckResult {
  const CheckResult({required this.updateAvailable, this.reason, this.release});

  final bool updateAvailable;

  /// Why nothing is offered, for example `up_to_date`, `runtime_incompatible` or `base_mismatch`.
  final String? reason;
  final FireOTARelease? release;
}

/// Everything the UI needs, as one immutable value.
class FireOTASnapshot {
  const FireOTASnapshot({
    this.configured = false,
    this.status = UpdateStatus.idle,
    this.runtimeVersion,
    this.channel,
    this.appVersion,
    this.currentReleaseId,
    this.pendingReleaseId,
    this.available,
    this.error,
    this.lastCheckedAt,
    this.revision = 0,
  });

  final bool configured;
  final UpdateStatus status;
  final String? runtimeVersion;
  final String? channel;
  final String? appVersion;

  /// The patch this app runs, or null for the code shipped in the store build.
  final String? currentReleaseId;

  /// A downloaded patch that applies on the next start.
  final String? pendingReleaseId;
  final FireOTARelease? available;
  final String? error;
  final DateTime? lastCheckedAt;

  /// Increases whenever assets or config change, so widgets can rebuild.
  final int revision;

  FireOTASnapshot copyWith({
    bool? configured,
    UpdateStatus? status,
    String? runtimeVersion,
    String? channel,
    String? appVersion,
    String? Function()? currentReleaseId,
    String? Function()? pendingReleaseId,
    FireOTARelease? Function()? available,
    String? Function()? error,
    DateTime? lastCheckedAt,
    int? revision,
  }) {
    return FireOTASnapshot(
      configured: configured ?? this.configured,
      status: status ?? this.status,
      runtimeVersion: runtimeVersion ?? this.runtimeVersion,
      channel: channel ?? this.channel,
      appVersion: appVersion ?? this.appVersion,
      currentReleaseId: currentReleaseId != null ? currentReleaseId() : this.currentReleaseId,
      pendingReleaseId: pendingReleaseId != null ? pendingReleaseId() : this.pendingReleaseId,
      available: available != null ? available() : this.available,
      error: error != null ? error() : this.error,
      lastCheckedAt: lastCheckedAt ?? this.lastCheckedAt,
      revision: revision ?? this.revision,
    );
  }
}

/// Device state reported by the native side.
class NativeState {
  NativeState(Map<Object?, Object?> raw) : _raw = raw.cast<String, Object?>();

  final Map<String, Object?> _raw;

  String get platform => _raw['platform'] as String? ?? '';
  String get installationId => _raw['installationId'] as String? ?? '';
  String get appVersion => _raw['appVersion'] as String? ?? '';
  String get buildNumber => _raw['buildNumber'] as String? ?? '';
  String get abi => _raw['abi'] as String? ?? '';
  String get baseFingerprint => _raw['baseFingerprint'] as String? ?? '';
  String? get currentReleaseId => _raw['currentReleaseId'] as String?;
  String? get pendingReleaseId => _raw['pendingReleaseId'] as String?;
  String? get failedReleaseId => _raw['failedReleaseId'] as String?;
  String? get failedReason => _raw['failedReason'] as String?;
  bool get isFirstRun => _raw['isFirstRun'] == true;
  Set<String> get blockedReleaseIds => ((_raw['blockedReleaseIds'] as List?) ?? const []).map((e) => '$e').toSet();
}
