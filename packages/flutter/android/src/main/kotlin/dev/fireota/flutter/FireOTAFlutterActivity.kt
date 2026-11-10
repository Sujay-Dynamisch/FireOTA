package dev.fireota.flutter

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterShellArgs

/**
 * Drop-in replacement for FlutterActivity that starts the engine with the installed code patch.
 * In MainActivity.kt: `class MainActivity : FireOTAFlutterActivity()`.
 */
open class FireOTAFlutterActivity : FlutterActivity() {
  override fun getFlutterShellArgs(): FlutterShellArgs =
    FireOTA.applyShellArgs(this, super.getFlutterShellArgs())
}
