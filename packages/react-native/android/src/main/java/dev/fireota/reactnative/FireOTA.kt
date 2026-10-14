package dev.fireota.reactnative

import android.content.Context

/**
 * Entry point for MainApplication. Returns the path of the OTA bundle to load, or null to
 * fall back to the bundle shipped inside the APK/AAB.
 *
 *   override fun getJSBundleFile(): String? =
 *       FireOTA.getJSBundleFile(applicationContext) ?: super.getJSBundleFile()
 */
object FireOTA {
  @Volatile private var resolved = false
  @Volatile private var bundlePath: String? = null

  @JvmStatic
  fun getJSBundleFile(context: Context): String? {
    // Resolve once per process: launch attempts are counted per process start.
    if (!resolved) {
      synchronized(this) {
        if (!resolved) {
          bundlePath = try {
            FireOTAStore(context.applicationContext).resolveLaunchBundle()
          } catch (_: Throwable) {
            null // never block startup: fall back to the embedded bundle
          }
          resolved = true
        }
      }
    }
    return bundlePath
  }
}
