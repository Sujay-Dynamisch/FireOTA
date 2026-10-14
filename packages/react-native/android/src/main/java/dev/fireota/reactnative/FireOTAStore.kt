package dev.fireota.reactnative

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.GZIPInputStream
import org.json.JSONObject

/**
 * On-device OTA state. Bundles live in app-private storage:
 *   filesDir/fireota/releases/<releaseId>/index.android.bundle (+ drawable-* assets)
 *
 * Launch rules (resolveLaunchBundle, once per process):
 *  - a new native binary (store update / reinstall) discards every OTA bundle;
 *  - a pending release is promoted to current and must confirm (markSuccess) during this launch;
 *  - a current release that reaches a second launch unconfirmed is rolled back to the previous one.
 */
internal class FireOTAStore(private val context: Context) {
  private val prefs: SharedPreferences = context.getSharedPreferences("dev.fireota", Context.MODE_PRIVATE)
  private val root = File(context.filesDir, "fireota/releases")

  fun releaseDir(releaseId: String) = File(root, safe(releaseId))
  fun bundleFile(releaseId: String) = File(releaseDir(releaseId), BUNDLE_NAME)

  val installationId: String
    get() = prefs.getString(KEY_INSTALLATION, null) ?: UUID.randomUUID().toString().also {
      prefs.edit().putString(KEY_INSTALLATION, it).apply()
    }

  fun get(key: String): String? = prefs.getString(key, null)
  fun isUnconfirmed() = prefs.getBoolean(KEY_UNCONFIRMED, false)

  @Synchronized
  fun resolveLaunchBundle(): String? {
    val binary = binaryVersion()
    if (prefs.getString(KEY_BINARY, null) != binary) {
      root.deleteRecursively()
      prefs.edit()
        .remove(KEY_CURRENT).remove(KEY_PREVIOUS).remove(KEY_PENDING).remove(KEY_DOWNLOADED)
        .putBoolean(KEY_UNCONFIRMED, false).putInt(KEY_ATTEMPTS, 0)
        .putString(KEY_BINARY, binary)
        .commit()
    }

    val edit = prefs.edit()
    val pending = prefs.getString(KEY_PENDING, null)
    if (pending != null && bundleFile(pending).exists()) {
      edit.putString(KEY_PREVIOUS, prefs.getString(KEY_CURRENT, null))
        .putString(KEY_CURRENT, pending)
        .putBoolean(KEY_UNCONFIRMED, true)
        .putInt(KEY_ATTEMPTS, 0)
    }
    edit.remove(KEY_PENDING).commit()

    if (prefs.getBoolean(KEY_UNCONFIRMED, false)) {
      val attempts = prefs.getInt(KEY_ATTEMPTS, 0) + 1
      if (attempts >= 2) {
        val failed = prefs.getString(KEY_CURRENT, null)
        prefs.edit()
          .putString(KEY_FAILED, failed)
          .putString(KEY_CURRENT, prefs.getString(KEY_PREVIOUS, null))
          .remove(KEY_PREVIOUS)
          .putBoolean(KEY_UNCONFIRMED, false)
          .putInt(KEY_ATTEMPTS, 0)
          .commit()
        failed?.let { releaseDir(it).deleteRecursively() }
      } else {
        prefs.edit().putInt(KEY_ATTEMPTS, attempts).commit()
      }
    }

    val current = prefs.getString(KEY_CURRENT, null) ?: return null
    val file = bundleFile(current)
    if (!file.exists()) {
      prefs.edit().remove(KEY_CURRENT).putBoolean(KEY_UNCONFIRMED, false).commit()
      return null
    }
    return file.absolutePath
  }

  fun markSuccess() {
    prefs.edit().putBoolean(KEY_UNCONFIRMED, false).putInt(KEY_ATTEMPTS, 0).commit()
    val keep = setOf(get(KEY_CURRENT), get(KEY_PREVIOUS), get(KEY_PENDING), get(KEY_DOWNLOADED)).filterNotNull().map(::safe)
    root.listFiles()?.filter { it.name !in keep }?.forEach { it.deleteRecursively() }
  }

  fun setPending(releaseId: String) {
    require(bundleFile(releaseId).exists()) { "Release $releaseId has not been downloaded." }
    prefs.edit().putString(KEY_PENDING, releaseId).remove(KEY_DOWNLOADED).commit()
  }

  fun clear(key: String) = prefs.edit().remove(key).commit()

  /** Streams the package to disk, verifies its SHA-256, then unpacks it atomically. */
  fun download(url: String, expectedSha256: String, releaseId: String) {
    require(url.startsWith("https://")) { "Updates must be downloaded over HTTPS." }
    root.mkdirs()
    val tmp = File(root, ".${safe(releaseId)}.download")
    val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
    connection.connectTimeout = 15_000
    connection.readTimeout = 60_000
    connection.instanceFollowRedirects = true
    try {
      if (connection.responseCode !in 200..299) throw IllegalStateException("Download failed: HTTP ${connection.responseCode}")
      val digest = MessageDigest.getInstance("SHA-256")
      connection.inputStream.use { input ->
        FileOutputStream(tmp).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
            output.write(buffer, 0, read)
          }
        }
      }
      val actual = digest.digest().joinToString("") { "%02x".format(it) }
      if (!actual.equals(expectedSha256, ignoreCase = true)) throw SecurityException("Checksum mismatch: the update was rejected.")

      val staging = File(root, ".${safe(releaseId)}.staging")
      staging.deleteRecursively()
      unpack(tmp, staging)
      if (!File(staging, BUNDLE_NAME).exists()) throw IllegalStateException("The update package has no $BUNDLE_NAME.")
      val target = releaseDir(releaseId)
      target.deleteRecursively()
      if (!staging.renameTo(target)) throw IllegalStateException("Could not store the update.")
      prefs.edit().putString(KEY_DOWNLOADED, releaseId).commit()
    } finally {
      connection.disconnect()
      tmp.delete()
    }
  }

  /**
   * FireOTA package: gzip( "FOTA1\n" | u32 header length | JSON {files:[{path,size}]} | file bytes... ).
   * Paths are validated so a package can never write outside its release directory.
   */
  private fun unpack(archive: File, into: File) {
    DataInputStream(GZIPInputStream(FileInputStream(archive), 64 * 1024)).use { input ->
      val magic = ByteArray(6)
      input.readFully(magic)
      if (String(magic, Charsets.US_ASCII) != "FOTA1\n") throw IllegalStateException("Not a FireOTA package.")
      val headerLength = input.readInt()
      if (headerLength <= 0 || headerLength > 4 * 1024 * 1024) throw IllegalStateException("Invalid package header.")
      val header = ByteArray(headerLength)
      input.readFully(header)
      val files = JSONObject(String(header, Charsets.UTF_8)).getJSONArray("files")
      val base = into.canonicalFile
      for (i in 0 until files.length()) {
        val entry = files.getJSONObject(i)
        val path = entry.getString("path")
        val size = entry.getLong("size")
        val out = File(base, path).canonicalFile
        if (path.startsWith("/") || path.contains("..") || !out.path.startsWith(base.path + File.separator)) {
          throw SecurityException("Unsafe path in update package: $path")
        }
        out.parentFile?.mkdirs()
        FileOutputStream(out).use { output ->
          var remaining = size
          val buffer = ByteArray(64 * 1024)
          while (remaining > 0) {
            val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
            if (read < 0) throw IllegalStateException("Truncated update package.")
            output.write(buffer, 0, read)
            remaining -= read
          }
        }
      }
    }
  }

  fun nativeVersion(): String = packageInfo()?.versionName ?: ""

  private fun binaryVersion(): String {
    val info = packageInfo() ?: return ""
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    return "${info.versionName}-$code-${info.lastUpdateTime}"
  }

  private fun packageInfo() = try {
    context.packageManager.getPackageInfo(context.packageName, 0)
  } catch (_: PackageManager.NameNotFoundException) {
    null
  }

  private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9_-]"), "")

  companion object {
    const val BUNDLE_NAME = "index.android.bundle"
    const val KEY_INSTALLATION = "installationId"
    const val KEY_BINARY = "binary"
    const val KEY_CURRENT = "current"
    const val KEY_PREVIOUS = "previous"
    const val KEY_PENDING = "pending"
    const val KEY_DOWNLOADED = "downloaded"
    const val KEY_FAILED = "failed"
    const val KEY_UNCONFIRMED = "unconfirmed"
    const val KEY_ATTEMPTS = "attempts"
  }
}
