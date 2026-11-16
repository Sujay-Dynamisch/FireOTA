import 'dart:io';

// material.dart is deprecated in newer Flutter, but package:material_ui does not exist in the
// older versions this package supports (Flutter 3.22+).
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PlatformException;

import 'fireota.dart';
import 'models.dart';

/// Rebuilds whenever the update state changes.
class FireOTABuilder extends StatelessWidget {
  const FireOTABuilder({super.key, required this.builder});

  final Widget Function(BuildContext context, FireOTASnapshot snapshot) builder;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<FireOTASnapshot>(
      valueListenable: FireOTA.state,
      builder: (context, snapshot, _) => builder(context, snapshot),
    );
  }
}

/// A banner that appears once an update has downloaded, with a button to apply it now.
/// Put it above your app's content, for example in a `Column` or `Stack`.
class FireOTAUpdateBanner extends StatelessWidget {
  const FireOTAUpdateBanner({
    super.key,
    this.title = 'An update is ready',
    this.actionLabel = 'Restart',
    this.laterLabel = 'Later',
  });

  final String title;
  final String actionLabel;
  final String laterLabel;

  @override
  Widget build(BuildContext context) {
    return FireOTABuilder(
      builder: (context, snapshot) {
        if (snapshot.status != UpdateStatus.installed || snapshot.pendingReleaseId == null) {
          return const SizedBox.shrink();
        }
        final notes = snapshot.available?.notes ?? '';
        return MaterialBanner(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              if (notes.isNotEmpty) Text(notes, maxLines: 3, overflow: TextOverflow.ellipsis),
            ],
          ),
          leading: const Icon(Icons.system_update_alt),
          actions: [
            TextButton(onPressed: FireOTA.clearPendingUpdate, child: Text(laterLabel)),
            FilledButton(onPressed: FireOTA.restart, child: Text(actionLabel)),
          ],
        );
      },
    );
  }
}

/// Text shown by [FireOTAUpdatePrompt]. Override any of it to translate or rephrase.
class FireOTAPromptLabels {
  const FireOTAPromptLabels({
    this.availableTitle = 'Update available',
    this.availableBody = 'A new version of the app is ready to download.',
    this.update = 'Update',
    this.notNow = 'Not now',
    this.downloadingTitle = 'Downloading update',
    this.requiredTitle = 'Installing an important update',
    this.downloadingBody = 'You can keep using the app while this finishes.',
    this.hide = 'Hide',
    this.readyTitle = 'Update ready',
    this.readyBody = 'Restart the app to start using the new version.',
    this.restart = 'Restart now',
    this.later = 'Later',
    this.failedTitle = 'Update failed',
    this.retry = 'Try again',
    this.close = 'Close',
  });

  final String availableTitle;
  final String availableBody;
  final String update;
  final String notNow;
  final String downloadingTitle;
  final String requiredTitle;
  final String downloadingBody;
  final String hide;
  final String readyTitle;
  final String readyBody;
  final String restart;
  final String later;
  final String failedTitle;
  final String retry;
  final String close;
}

enum _Phase { available, downloading, ready, failed }

/// The complete update flow as Material 3 dialogs, styled by your app's [Theme] (light and dark):
///
///  1. "Update available" with the release notes → Update / Not now
///  2. "Downloading update" with a progress bar (mandatory updates cannot be hidden)
///  3. "Update ready" → Restart now / Later
///
/// Wrap your app once, usually in `MaterialApp.builder`:
///
/// ```dart
/// MaterialApp(builder: (context, child) => FireOTAUpdatePrompt(child: child!));
/// ```
///
/// Set `autoDownload: false` in [FireOTAConfig] so optional updates wait for the user to tap
/// "Update". With the default (`true`) they download in the background and the prompt only asks
/// to restart.
class FireOTAUpdatePrompt extends StatefulWidget {
  const FireOTAUpdatePrompt({super.key, required this.child, this.labels = const FireOTAPromptLabels()});

  final Widget child;
  final FireOTAPromptLabels labels;

  @override
  State<FireOTAUpdatePrompt> createState() => _FireOTAUpdatePromptState();
}

class _FireOTAUpdatePromptState extends State<FireOTAUpdatePrompt> {
  String? _dismissedAvailable;
  String? _dismissedReady;
  String? _hidden;
  String? _userStarted;
  String? _failed;
  bool _busy = false;

  Future<void> _update(FireOTARelease release) async {
    setState(() {
      _failed = null;
      _userStarted = release.id;
      _busy = true;
    });
    try {
      await FireOTA.downloadUpdate(release);
      await FireOTA.installUpdate(release);
    } on Object catch (error) {
      if (mounted) setState(() => _failed = error is PlatformException ? (error.message ?? error.code) : '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  _Phase? _phaseFor(FireOTASnapshot s) {
    final release = s.available;
    final id = release?.id;
    final mandatory = release?.mandatory ?? false;
    final downloading = s.status == UpdateStatus.downloading || s.status == UpdateStatus.downloaded;
    final pending = s.pendingReleaseId != null && s.pendingReleaseId != s.currentReleaseId ? s.pendingReleaseId : null;
    if (_failed != null) return _Phase.failed;
    if (id != null &&
        _hidden != id &&
        ((downloading && (mandatory || _userStarted == id)) ||
            (_busy && _userStarted == id && s.status != UpdateStatus.installed))) {
      return _Phase.downloading;
    }
    if (s.status == UpdateStatus.installed && pending != null && _dismissedReady != pending) return _Phase.ready;
    if (!FireOTA.autoDownload &&
        release != null &&
        !mandatory &&
        !downloading &&
        s.status != UpdateStatus.installed &&
        s.status != UpdateStatus.error &&
        pending != id &&
        _userStarted != id &&
        _dismissedAvailable != id) {
      return _Phase.available;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return FireOTABuilder(
      builder: (context, snapshot) {
        final phase = _phaseFor(snapshot);
        return Stack(
          children: [
            widget.child,
            Positioned.fill(
              child: IgnorePointer(
                ignoring: phase == null,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(animation), child: child),
                  ),
                  child: phase == null
                      ? const SizedBox.shrink(key: ValueKey('none'))
                      : ColoredBox(
                          key: ValueKey(phase),
                          color: Colors.black54,
                          child: _dialog(context, phase, snapshot),
                        ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _dialog(BuildContext context, _Phase phase, FireOTASnapshot s) {
    final labels = widget.labels;
    final release = s.available;
    final mandatory = release?.mandatory ?? false;
    final notes = release?.notes ?? '';
    final theme = Theme.of(context);
    switch (phase) {
      case _Phase.available:
        final size = _formatBytes(release?.bundleSize ?? 0);
        final version = release?.version ?? '';
        return AlertDialog(
          icon: const Icon(Icons.system_update),
          title: Text(labels.availableTitle),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(notes.isNotEmpty ? notes : labels.availableBody),
              if (version.isNotEmpty || size.isNotEmpty) ...[
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  children: [
                    if (version.isNotEmpty) Chip(label: Text('v$version'), visualDensity: VisualDensity.compact),
                    if (size.isNotEmpty) Chip(label: Text(size), visualDensity: VisualDensity.compact),
                  ],
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => setState(() => _dismissedAvailable = release?.id), child: Text(labels.notNow)),
            FilledButton(onPressed: release == null ? null : () => _update(release), child: Text(labels.update)),
          ],
        );
      case _Phase.downloading:
        final progress = s.status == UpdateStatus.downloaded ? 1.0 : s.downloadProgress;
        final total = release?.bundleSize ?? 0;
        final percent = progress == null ? null : (progress * 100).round();
        final detail = progress == null
            ? (s.status == UpdateStatus.downloaded ? 'Verifying…' : 'Downloading…')
            : total > 0
                ? '${_formatBytes((total * progress).round(), zero: true)} of ${_formatBytes(total)}'
                : 'Downloading…';
        return AlertDialog(
          icon: const Icon(Icons.downloading),
          title: Text(mandatory ? labels.requiredTitle : labels.downloadingTitle),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(mandatory && notes.isNotEmpty ? notes : labels.downloadingBody),
              const SizedBox(height: 20),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: TweenAnimationBuilder<double>(
                  tween: Tween(end: progress ?? 0),
                  duration: const Duration(milliseconds: 250),
                  builder: (context, value, _) => LinearProgressIndicator(value: progress == null ? null : value, minHeight: 6),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: Text(detail, style: theme.textTheme.bodySmall)),
                  if (percent != null) Text('$percent%', style: theme.textTheme.labelMedium),
                ],
              ),
            ],
          ),
          actions: mandatory
              ? null
              : [TextButton(onPressed: () => setState(() => _hidden = release?.id), child: Text(labels.hide))],
        );
      case _Phase.ready:
        return AlertDialog(
          icon: const Icon(Icons.restart_alt),
          title: Text(labels.readyTitle),
          content: Text(notes.isNotEmpty ? notes : labels.readyBody),
          actions: [
            if (!mandatory)
              TextButton(onPressed: () => setState(() => _dismissedReady = s.pendingReleaseId), child: Text(labels.later)),
            FilledButton(onPressed: FireOTA.restart, child: Text(labels.restart)),
          ],
        );
      case _Phase.failed:
        return AlertDialog(
          icon: Icon(Icons.error_outline, color: theme.colorScheme.error),
          title: Text(labels.failedTitle),
          content: Text(_failed ?? ''),
          actions: [
            TextButton(
              onPressed: () => setState(() {
                _failed = null;
                _userStarted = null;
                _dismissedAvailable = release?.id;
              }),
              child: Text(labels.close),
            ),
            FilledButton(onPressed: release == null ? null : () => _update(release), child: Text(labels.retry)),
          ],
        );
    }
  }
}

String _formatBytes(int bytes, {bool zero = false}) {
  if (bytes <= 0) return zero ? '0 KB' : '';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).ceil()} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

/// An image that comes from the latest asset update when it replaces [path], and from the
/// asset bundled with the app otherwise.
class FireOTAImage extends StatelessWidget {
  const FireOTAImage(this.path, {super.key, this.width, this.height, this.fit});

  final String path;
  final double? width;
  final double? height;
  final BoxFit? fit;

  @override
  Widget build(BuildContext context) {
    return FireOTABuilder(
      builder: (context, snapshot) => FutureBuilder<File?>(
        key: ValueKey('${snapshot.currentReleaseId}:${snapshot.revision}'),
        future: FireOTA.assetFile(path),
        builder: (context, file) {
          final updated = file.data;
          if (updated != null) return Image.file(updated, width: width, height: height, fit: fit);
          if (file.connectionState != ConnectionState.done) return SizedBox(width: width, height: height);
          return Image.asset(path, width: width, height: height, fit: fit);
        },
      ),
    );
  }
}
