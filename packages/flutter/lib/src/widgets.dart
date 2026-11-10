import 'dart:io';

import 'package:flutter/material.dart';

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
