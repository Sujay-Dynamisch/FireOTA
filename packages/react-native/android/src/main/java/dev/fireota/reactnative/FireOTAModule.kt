package dev.fireota.reactnative

import android.content.Intent
import android.os.Process
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.Executors

class FireOTAModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val store = FireOTAStore(reactContext)
  private val io = Executors.newSingleThreadExecutor()

  override fun getName() = "FireOTA"

  @ReactMethod
  fun getState(promise: Promise) {
    try {
      val map = Arguments.createMap()
      map.putString("installationId", store.installationId)
      map.putString("nativeVersion", store.nativeVersion())
      map.putString("appVersion", store.nativeVersion())
      map.putString("currentReleaseId", store.get(FireOTAStore.KEY_CURRENT))
      map.putString("pendingReleaseId", store.get(FireOTAStore.KEY_PENDING))
      map.putString("previousReleaseId", store.get(FireOTAStore.KEY_PREVIOUS))
      map.putString("failedReleaseId", store.get(FireOTAStore.KEY_FAILED))
      map.putBoolean("isFirstRun", store.isUnconfirmed())
      promise.resolve(map)
    } catch (e: Throwable) {
      promise.reject("FIREOTA_STATE", e.message, e)
    }
  }

  @ReactMethod
  fun downloadUpdate(url: String, sha256: String, releaseId: String, promise: Promise) {
    io.execute {
      try {
        store.download(url, sha256, releaseId)
        promise.resolve(null)
      } catch (e: SecurityException) {
        promise.reject("FIREOTA_CHECKSUM", e.message, e)
      } catch (e: Throwable) {
        promise.reject("FIREOTA_DOWNLOAD", e.message, e)
      }
    }
  }

  /**
   * Verifies an RSA-SHA256 (PKCS#1 v1.5) update signature against the app's embedded public key
   * (base64 X.509 SubjectPublicKeyInfo). Any parsing problem counts as an invalid signature.
   */
  @ReactMethod
  fun verifySignature(message: String, signatureBase64: String, publicKeyBase64: String, promise: Promise) {
    try {
      val key = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.decode(publicKeyBase64, Base64.DEFAULT)))
      val verifier = Signature.getInstance("SHA256withRSA")
      verifier.initVerify(key)
      verifier.update(message.toByteArray(Charsets.UTF_8))
      promise.resolve(verifier.verify(Base64.decode(signatureBase64, Base64.DEFAULT)))
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun installUpdate(releaseId: String, promise: Promise) {
    try {
      store.setPending(releaseId)
      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject("FIREOTA_INSTALL", e.message, e)
    }
  }

  @ReactMethod
  fun markSuccess(promise: Promise) {
    io.execute {
      try {
        store.markSuccess()
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject("FIREOTA_CONFIRM", e.message, e)
      }
    }
  }

  @ReactMethod
  fun clearPending(promise: Promise) {
    store.clear(FireOTAStore.KEY_PENDING)
    store.clear(FireOTAStore.KEY_DOWNLOADED)
    promise.resolve(null)
  }

  @ReactMethod
  fun clearFailed(promise: Promise) {
    store.clear(FireOTAStore.KEY_FAILED)
    promise.resolve(null)
  }

  /**
   * Restarts the process so the pending bundle loads. React Native reuses its bundle loader on
   * a JS reload, so a cold restart is the reliable way to switch bundles on Android.
   */
  @ReactMethod
  fun restartApp(promise: Promise) {
    val launch = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
    if (launch == null) {
      promise.reject("FIREOTA_RESTART", "No launch activity found.")
      return
    }
    promise.resolve(null)
    val intent = Intent(reactContext, FireOTARestartActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .putExtra(FireOTARestartActivity.EXTRA_LAUNCH, launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
      .putExtra(FireOTARestartActivity.EXTRA_PID, Process.myPid())
    reactContext.startActivity(intent)
    reactContext.currentActivity?.finishAffinity()
    Runtime.getRuntime().exit(0)
  }
}
