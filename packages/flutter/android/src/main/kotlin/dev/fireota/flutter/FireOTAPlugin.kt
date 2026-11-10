package dev.fireota.flutter

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Base64
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.Executors

/** Bridges the Dart API to the patch store. Blocking work runs off the main thread. */
class FireOTAPlugin : FlutterPlugin, MethodChannel.MethodCallHandler, ActivityAware {
  private lateinit var channel: MethodChannel
  private lateinit var context: Context
  private var activity: Activity? = null
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    context = binding.applicationContext
    channel = MethodChannel(binding.binaryMessenger, "dev.fireota/flutter")
    channel.setMethodCallHandler(this)
    // Counts this launch even when the app did not route the engine through FireOTA.
    FireOTA.launch(context)
  }

  override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    channel.setMethodCallHandler(null)
  }

  override fun onAttachedToActivity(binding: ActivityPluginBinding) {
    activity = binding.activity
  }

  override fun onDetachedFromActivityForConfigChanges() {
    activity = null
  }

  override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
    activity = binding.activity
  }

  override fun onDetachedFromActivity() {
    activity = null
  }

  override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
    val store = FireOTA.store(context)
    when (call.method) {
      "getState" -> background(result) { state(store) }
      "setCodePushEnabled" -> {
        store.codePushEnabled = call.argument<Boolean>("enabled") == true
        result.success(null)
      }
      "download" -> background(result) {
        store.download(call.argument<String>("url")!!, call.argument<String>("sha256")!!, call.argument<String>("releaseId")!!)
        null
      }
      "verifySignature" -> result.success(
        verify(call.argument<String>("message")!!, call.argument<String>("signature")!!, call.argument<String>("publicKey")!!),
      )
      "install" -> background(result) {
        store.setPending(call.argument<String>("releaseId")!!)
        null
      }
      "markSuccess" -> background(result) { markSuccess(store, call.argument<String>("buildId").orEmpty()) }
      "clearPending" -> {
        store.clear(FireOTAStore.KEY_PENDING, FireOTAStore.KEY_DOWNLOADED)
        result.success(null)
      }
      "clearFailed" -> {
        store.clear(FireOTAStore.KEY_FAILED, FireOTAStore.KEY_FAILED_REASON)
        result.success(null)
      }
      "assetPath" -> result.success(store.assetPath(call.argument<String>("path")!!))
      "config" -> background(result) { store.config() }
      "restart" -> restart(result)
      else -> result.notImplemented()
    }
  }

  private fun state(store: FireOTAStore): Map<String, Any?> {
    val launch = FireOTA.launch(context)
    return mapOf(
      "platform" to "android",
      "installationId" to store.installationId,
      "appVersion" to store.versionName(),
      "buildNumber" to store.versionCode().toString(),
      "abi" to store.abi,
      "baseFingerprint" to store.baseFingerprint(),
      "currentReleaseId" to store.get(FireOTAStore.KEY_CURRENT),
      "pendingReleaseId" to store.get(FireOTAStore.KEY_PENDING),
      "downloadedReleaseId" to store.get(FireOTAStore.KEY_DOWNLOADED),
      "failedReleaseId" to store.get(FireOTAStore.KEY_FAILED),
      "failedReason" to store.get(FireOTAStore.KEY_FAILED_REASON),
      "blockedReleaseIds" to store.blocked().toList(),
      "isFirstRun" to store.isUnconfirmed(),
      "codePushApplied" to (FireOTA.applied && launch.library != null),
      "skipped" to launch.skipped,
    )
  }

  /**
   * Confirms this launch. A code patch also has to prove it is the code that is running: if the
   * engine could not load it, Flutter silently runs the store build instead, so the build ID
   * compiled into the running Dart code must match the patch's.
   */
  private fun markSuccess(store: FireOTAStore, runningBuildId: String): Map<String, Any?> {
    val launch = FireOTA.launch(context)
    val current = store.get(FireOTAStore.KEY_CURRENT)
    val meta = store.descriptor(current)
    if (current != null && meta?.optString("kind") == FireOTAStore.KIND_AOT) {
      val reason = when {
        launch.skipped != null -> launch.skipped
        !FireOTA.applied -> "code_push_not_configured"
        launch.expectedBuildId == null || launch.expectedBuildId != runningBuildId -> "patch_not_loaded"
        else -> null
      }
      if (reason != null) {
        store.rollBackCurrent(reason)
        return mapOf("ok" to false, "releaseId" to current, "reason" to reason)
      }
    }
    store.markSuccess()
    return mapOf("ok" to true)
  }

  private fun verify(message: String, signatureBase64: String, publicKeyBase64: String): Boolean = try {
    val key = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.decode(publicKeyBase64, Base64.DEFAULT)))
    val verifier = Signature.getInstance("SHA256withRSA")
    verifier.initVerify(key)
    verifier.update(message.toByteArray(Charsets.UTF_8))
    verifier.verify(Base64.decode(signatureBase64, Base64.DEFAULT))
  } catch (_: Throwable) {
    false
  }

  /** The engine picks its Dart code once per process, so applying a patch needs a cold restart. */
  private fun restart(result: MethodChannel.Result) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launch == null) {
      result.error("restart_failed", "No launch activity found.", null)
      return
    }
    result.success(null)
    val intent = Intent(context, FireOTARestartActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .putExtra(FireOTARestartActivity.EXTRA_LAUNCH, launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
      .putExtra(FireOTARestartActivity.EXTRA_PID, Process.myPid())
    main.post {
      context.startActivity(intent)
      activity?.finishAffinity()
      Runtime.getRuntime().exit(0)
    }
  }

  private fun background(result: MethodChannel.Result, work: () -> Any?) {
    io.execute {
      try {
        val value = work()
        main.post { result.success(value) }
      } catch (e: FireOTAException) {
        main.post { result.error(e.code, e.message, null) }
      } catch (e: Throwable) {
        main.post { result.error("native_error", e.message ?: e.toString(), null) }
      }
    }
  }
}
