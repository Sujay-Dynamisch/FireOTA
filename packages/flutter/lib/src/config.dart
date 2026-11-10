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
}
