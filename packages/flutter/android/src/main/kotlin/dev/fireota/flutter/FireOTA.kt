package dev.fireota.flutter

import android.content.Context
import android.util.Log
import io.flutter.embedding.engine.FlutterShellArgs

/**
 * Entry points for the host app. The patched Dart code must be chosen before the Flutter engine
 * starts, so it is passed to the engine as a shell argument:
 *
 *   class MainActivity : FireOTAFlutterActivity()                         // the usual setup
 *   FlutterEngine(context, FireOTA.engineArgs(context))                    // cached engines
 *   FlutterEngineGroup(context, FireOTA.engineArgs(context))               // engine groups
 */
object FireOTA {
  private const val TAG = "FireOTA"

  @Volatile private var store: FireOTAStore? = null
  @Volatile private var launch: Launch? = null

  /** True once the patch path reached an engine's arguments in this process. */
  @Volatile internal var applied = false
    private set

  internal fun store(context: Context): FireOTAStore =
    store ?: synchronized(this) { store ?: FireOTAStore(context).also { store = it } }

  /** Resolves which patch this process runs. Safe to call many times; it only counts one launch. */
  internal fun launch(context: Context): Launch =
    launch ?: synchronized(this) {
      launch ?: runCatching { store(context).resolveLaunch() }
        .getOrElse {
          Log.w(TAG, "Could not resolve the launch patch; running the store build.", it)
          Launch(null, null, null, "error")
        }
        .also { launch = it }
    }

  /** Adds the patched library to an activity's shell arguments. */
  @JvmStatic
  fun applyShellArgs(context: Context, args: FlutterShellArgs): FlutterShellArgs {
    val library = launch(context).library
    if (library != null) {
      args.add("$AOT_ARG$library")
      applied = true
    }
    return args
  }

  /** Engine arguments for a FlutterEngine or FlutterEngineGroup you create yourself. */
  @JvmStatic
  fun engineArgs(context: Context, extra: Array<String> = emptyArray()): Array<String> {
    val library = launch(context).library ?: return extra
    applied = true
    return extra + "$AOT_ARG$library"
  }

  private const val AOT_ARG = "--aot-shared-library-name="
}
