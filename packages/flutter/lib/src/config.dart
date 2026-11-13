import 'models.dart';

/// When a downloaded update applies.
enum InstallMode {
  /// On the next cold start of the app (the default).
  nextRestart,

  /// Right away: the app restarts on Android; on iOS asset updates apply in place.
  immediate,
}

/// Settings for [FireOTA.init].
class FireOTAConfig {
  const FireOTAConfig({
    required this.appId,
    required this.serverUrl,
    this.channel = 'production',
    this.runtimeVersion,
    this.codeSigningCertificate,
    this.allowCodePush = false,
    this.checkOnAppStart = true,
    this.installMode = InstallMode.nextRestart,
    this.mandatoryInstallMode = InstallMode.immediate,
    this.onStatusChange,
    this.onEvent,
    this.headers = const {},
    this.checkOnResume = true,
    this.minCheckInterval = const Duration(minutes: 10),
    this.maxDownloadBytes = 200 * 1024 * 1024,
    this.allowInsecureServer = false,
  });

  /// The FireOTA app ID or slug, from the dashboard.
  final String appId;

  /// Your FireOTA deployment, for example `https://fireota.example.com`.
  final String serverUrl;

  /// The release channel this build follows.
  final String channel;

  /// The store build this app is. Defaults to `<version>+<build number>` from the store build,
  /// which is what `fireota release` and `fireota patch` use too.
  final String? runtimeVersion;

  /// PEM `PUBLIC KEY` from `fireota signing generate`. When set, unsigned updates are refused.
  /// Code patches are always refused without it.
  final String? codeSigningCertificate;

  /// Allows Dart code patches on Android. Off by default: read "Store policy" in the README
  /// before turning it on for an app distributed through Google Play.
  final bool allowCodePush;

  /// Checks for an update when [FireOTA.init] runs.
  final bool checkOnAppStart;

  /// How an optional update applies.
  final InstallMode installMode;

  /// How a mandatory update applies.
  final InstallMode mandatoryInstallMode;

  /// Called whenever the update status changes.
  final void Function(UpdateStatus status, {String? releaseId, String? error})? onStatusChange;

  /// Called for every update event the SDK reports (download_started, install_succeeded,
  /// rollback, ...), even when the report cannot reach the server. Forward it to Sentry,
  /// Datadog, Firebase Analytics or your own logging.
  final void Function(FireOTAEvent event)? onEvent;

  /// Extra headers sent with every request to the FireOTA server, for example for an API
  /// gateway. They cannot replace the SDK's own `content-type` and `x-fireota-sdk` headers.
  final Map<String, String> headers;

  /// Checks again when the app returns to the foreground, at most once per [minCheckInterval].
  final bool checkOnResume;

  final Duration minCheckInterval;

  /// Updates larger than this are refused before they are downloaded.
  final int maxDownloadBytes;

  /// Allows an `http://` server URL in debug and profile builds, for local testing.
  /// Release builds always require HTTPS.
  final bool allowInsecureServer;
}

/// An update event, as reported to the FireOTA server and to [FireOTAConfig.onEvent].
class FireOTAEvent {
  const FireOTAEvent({required this.name, required this.releaseId, this.metadata = const {}});

  /// download_started, download_completed, install_succeeded, install_failed or rollback.
  final String name;
  final String releaseId;

  /// For failures, `reason` holds the code shown on the dashboard (for example `patch_not_loaded`).
  final Map<String, Object?> metadata;

  @override
  String toString() => 'FireOTAEvent($name, $releaseId${metadata.isEmpty ? '' : ', $metadata'})';
}
