package dev.fireota.flutter

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.GZIPInputStream
import java.util.zip.ZipFile
import org.json.JSONObject

/** A refusal with a stable code the Dart side reports as the `reason` of an install failure. */
class FireOTAException(val code: String, message: String) : Exception(message)

/** What this process launched with. Resolved once, before the Flutter engine starts. */
internal data class Launch(
  val releaseId: String?,
  /** Absolute path of the patched libapp.so to load, or null to run the store build's code. */
  val library: String?,
  val expectedBuildId: String?,
  /** Why a code patch was not used this launch (abi_unsupported, base_mismatch, code_push_disabled). */
  val skipped: String?,
)

/**
 * On-device patch state. Patches live in app-private storage:
 *   filesDir/fireota/patches/<releaseId>/fireota.json      descriptor written by the CLI
 *   filesDir/fireota/patches/<releaseId>/lib/<abi>/libapp.so   compiled Dart code (code patches)
 *   filesDir/fireota/patches/<releaseId>/assets/...         asset updates
 *   filesDir/fireota/patches/<releaseId>/config.json        remote config
 *
 * Launch rules (resolveLaunch, once per process), the same as the React Native SDK:
 *  - a new store build (update or reinstall) discards every patch;
 *  - a pending patch is promoted to current and must confirm (markSuccess) during this launch;
 *  - a current patch that reaches a second launch unconfirmed is rolled back to the previous one.
 */
internal class FireOTAStore(context: Context) {
  private val app = context.applicationContext
  private val prefs: SharedPreferences = app.getSharedPreferences("dev.fireota.flutter", Context.MODE_PRIVATE)
  private val root = File(app.filesDir, "fireota/patches")

  fun patchDir(releaseId: String) = File(root, safe(releaseId))

  fun descriptor(releaseId: String?): JSONObject? {
    if (releaseId == null) return null
    val file = File(patchDir(releaseId), DESCRIPTOR)
    return if (file.exists()) runCatching { JSONObject(file.readText()) }.getOrNull() else null
  }

  val installationId: String
    get() = prefs.getString(KEY_INSTALLATION, null) ?: UUID.randomUUID().toString().also {
      prefs.edit().putString(KEY_INSTALLATION, it).apply()
    }

  fun get(key: String): String? = prefs.getString(key, null)
  fun isUnconfirmed() = prefs.getBoolean(KEY_UNCONFIRMED, false)

  var codePushEnabled: Boolean
    get() = prefs.getBoolean(KEY_CODE_PUSH, false)
    set(value) {
      prefs.edit().putBoolean(KEY_CODE_PUSH, value).apply()
    }

  val abi: String
    get() = Build.SUPPORTED_ABIS.firstOrNull() ?: ""

  @Synchronized
  fun resolveLaunch(): Launch {
    val binary = binaryVersion()
    if (prefs.getString(KEY_BINARY, null) != binary) {
      root.deleteRecursively()
      prefs.edit()
        .remove(KEY_CURRENT).remove(KEY_PREVIOUS).remove(KEY_PENDING).remove(KEY_DOWNLOADED)
        .remove(KEY_FINGERPRINT).remove(KEY_BLOCKED)
        .putBoolean(KEY_UNCONFIRMED, false).putInt(KEY_ATTEMPTS, 0)
        .putString(KEY_BINARY, binary)
        .commit()
    }

    val pending = prefs.getString(KEY_PENDING, null)
    val edit = prefs.edit()
    if (pending != null && descriptor(pending) != null) {
      edit.putString(KEY_PREVIOUS, prefs.getString(KEY_CURRENT, null))
        .putString(KEY_CURRENT, pending)
        .putBoolean(KEY_UNCONFIRMED, true)
        .putInt(KEY_ATTEMPTS, 0)
    }
    edit.remove(KEY_PENDING).commit()

    if (prefs.getBoolean(KEY_UNCONFIRMED, false)) {
      val attempts = prefs.getInt(KEY_ATTEMPTS, 0) + 1
      if (attempts >= 2) rollBackCurrent("launch_not_confirmed")
      else prefs.edit().putInt(KEY_ATTEMPTS, attempts).commit()
    }

    val current = prefs.getString(KEY_CURRENT, null)
    val meta = descriptor(current)
    if (current == null || meta == null) {
      if (current != null) prefs.edit().remove(KEY_CURRENT).putBoolean(KEY_UNCONFIRMED, false).commit()
      return Launch(null, null, null, null)
    }
    if (meta.optString("kind") != KIND_AOT) return Launch(current, null, null, null)

    val buildId = meta.optString("buildId").ifEmpty { null }
    if (!codePushEnabled) return Launch(current, null, buildId, "code_push_disabled")
    val library = File(patchDir(current), "lib/$abi/libapp.so")
    if (!library.exists()) return Launch(current, null, buildId, "abi_unsupported")
    val expectedBase = meta.optJSONObject("base")?.optString(abi).orEmpty()
    if (expectedBase.isEmpty() || !expectedBase.equals(baseFingerprint(), ignoreCase = true)) {
      return Launch(current, null, buildId, "base_mismatch")
    }
    return Launch(current, library.absolutePath, buildId, null)
  }

  /** Patches that failed on this device. They are never downloaded again, so a bad patch cannot loop. */
  fun blocked(): Set<String> = prefs.getStringSet(KEY_BLOCKED, emptySet()) ?: emptySet()

  /** Makes the previous patch (or the store build) current again and remembers why. */
  @Synchronized
  fun rollBackCurrent(reason: String) {
    val failed = prefs.getString(KEY_CURRENT, null)
    prefs.edit()
      .putStringSet(KEY_BLOCKED, blocked() + listOfNotNull(failed))
      .putString(KEY_FAILED, failed)
      .putString(KEY_FAILED_REASON, reason)
      .putString(KEY_CURRENT, prefs.getString(KEY_PREVIOUS, null))
      .remove(KEY_PREVIOUS)
      .putBoolean(KEY_UNCONFIRMED, false)
      .putInt(KEY_ATTEMPTS, 0)
      .commit()
    failed?.let { patchDir(it).deleteRecursively() }
  }

  fun markSuccess() {
    prefs.edit().putBoolean(KEY_UNCONFIRMED, false).putInt(KEY_ATTEMPTS, 0).commit()
    val keep = setOf(get(KEY_CURRENT), get(KEY_PREVIOUS), get(KEY_PENDING), get(KEY_DOWNLOADED)).filterNotNull().map(::safe)
    root.listFiles()?.filter { it.name !in keep }?.forEach { it.deleteRecursively() }
  }

  fun setPending(releaseId: String) {
    if (descriptor(releaseId) == null) throw FireOTAException("not_downloaded", "Release $releaseId has not been downloaded.")
    prefs.edit().putString(KEY_PENDING, releaseId).remove(KEY_DOWNLOADED).commit()
  }

  fun clear(vararg keys: String) {
    val edit = prefs.edit()
    keys.forEach { edit.remove(it) }
    edit.commit()
  }

  /**
   * Streams the package to disk, verifies its size and SHA-256, checks it fits this build, then
   * unpacks it atomically. A positive [expectedSize] must match exactly; nothing larger than
   * [maxBytes] (and never more than [HARD_LIMIT]) is written to disk.
   */
  fun download(
    url: String,
    expectedSha256: String,
    releaseId: String,
    expectedSize: Long = 0,
    maxBytes: Long = 0,
    onProgress: (received: Long, total: Long) -> Unit = { _, _ -> },
  ) {
    if (!url.startsWith("https://")) throw FireOTAException("insecure_url", "Updates must be downloaded over HTTPS.")
    if (releaseId in blocked()) throw FireOTAException("blocked", "This patch failed on this device before.")
    val limit = if (maxBytes in 1 until HARD_LIMIT) maxBytes else HARD_LIMIT
    if (expectedSize > limit) throw FireOTAException("too_large", "The update is larger than the download limit.")
    root.mkdirs()
    // Room for the package plus its unpacked copy, with headroom so the app keeps working.
    val needed = (if (expectedSize > 0) expectedSize else limit / 4) * 3
    val free = root.usableSpace // 0 when the system cannot tell
    if (free in 1 until needed) throw FireOTAException("insufficient_storage", "Not enough free storage for the update.")
    val tmp = File(root, ".${safe(releaseId)}.download")
    val staging = File(root, ".${safe(releaseId)}.staging")
    val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
    connection.connectTimeout = 15_000
    connection.readTimeout = 60_000
    connection.instanceFollowRedirects = true
    try {
      if (connection.responseCode !in 200..299) {
        throw FireOTAException("download_failed", "Download failed: HTTP ${connection.responseCode}")
      }
      val declared = connection.contentLengthLong
      if (declared > limit) throw FireOTAException("too_large", "The update is larger than the download limit.")
      val total = if (expectedSize > 0) expectedSize else declared
      val digest = MessageDigest.getInstance("SHA-256")
      var received = 0L
      var reported = 0L
      val step = maxOf(total / 50, 256L * 1024)
      connection.inputStream.use { input ->
        FileOutputStream(tmp).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            received += read
            if (received > limit || (expectedSize > 0 && received > expectedSize)) {
              throw FireOTAException("too_large", "The update is larger than announced.")
            }
            digest.update(buffer, 0, read)
            output.write(buffer, 0, read)
            if (received - reported >= step) {
              reported = received
              onProgress(received, total)
            }
          }
        }
      }
      if (expectedSize > 0 && received != expectedSize) {
        throw FireOTAException("size_mismatch", "The update is smaller than announced.")
      }
      onProgress(received, if (total > 0) total else received)
      val actual = hex(digest.digest())
      if (!actual.equals(expectedSha256, ignoreCase = true)) {
        throw FireOTAException("checksum_mismatch", "Checksum mismatch: the update was rejected.")
      }

      staging.deleteRecursively()
      unpack(tmp, staging)
      val meta = File(staging, DESCRIPTOR).takeIf { it.exists() }?.let { JSONObject(it.readText()) }
        ?: throw FireOTAException("invalid_package", "The update package has no $DESCRIPTOR; build it with `fireota patch`.")
      if (meta.optString("kind") == KIND_AOT) {
        if (!File(staging, "lib/$abi/libapp.so").exists()) {
          throw FireOTAException("abi_unsupported", "This patch has no code for this device ($abi).")
        }
        val base = meta.optJSONObject("base")?.optString(abi).orEmpty()
        if (!base.equals(baseFingerprint(), ignoreCase = true)) {
          throw FireOTAException("base_mismatch", "This patch was built for a different store build.")
        }
      }
      val target = patchDir(releaseId)
      target.deleteRecursively()
      if (!staging.renameTo(target)) throw FireOTAException("storage_failed", "Could not store the update.")
      prefs.edit().putString(KEY_DOWNLOADED, releaseId).commit()
    } finally {
      connection.disconnect()
      tmp.delete()
      staging.deleteRecursively()
    }
  }

  /** A file from the current patch's assets/ folder, or null when the patch does not change it. */
  fun assetPath(relative: String): String? {
    val current = get(KEY_CURRENT) ?: return null
    val base = File(patchDir(current), "assets").canonicalFile
    val file = File(base, relative).canonicalFile
    if (!file.path.startsWith(base.path + File.separator)) return null
    return file.takeIf { it.isFile }?.absolutePath
  }

  fun config(): String? {
    val current = get(KEY_CURRENT) ?: return null
    return File(patchDir(current), "config.json").takeIf { it.isFile }?.readText()
  }

  /**
   * SHA-256 of the store build's own libapp.so for this device's ABI. A code patch is compiled
   * against exactly one store build, and this is how the device proves it has that build.
   */
  fun baseFingerprint(): String {
    prefs.getString(KEY_FINGERPRINT, null)?.let { return it }
    val value = runCatching { computeBaseFingerprint() }.getOrNull().orEmpty()
    if (value.isNotEmpty()) prefs.edit().putString(KEY_FINGERPRINT, value).apply()
    return value
  }

  private fun computeBaseFingerprint(): String? {
    val info = app.applicationInfo
    val extracted = File(info.nativeLibraryDir ?: "", "libapp.so")
    if (extracted.isFile) return FileInputStream(extracted).use(::sha256)
    // Modern builds keep native libraries uncompressed inside the APK (or an ABI split).
    val apks = listOfNotNull(info.sourceDir) + (info.splitSourceDirs?.toList() ?: emptyList())
    for (apk in apks) {
      ZipFile(apk).use { zip ->
        val entry = zip.getEntry("lib/$abi/libapp.so") ?: return@use
        return zip.getInputStream(entry).use(::sha256)
      }
    }
    return null
  }

  /**
   * FireOTA package: gzip( "FOTA1\n" | u32 header length | JSON {files:[{path,size}]} | file bytes... ).
   * Paths are validated so a package can never write outside its patch directory.
   */
  private fun unpack(archive: File, into: File) {
    DataInputStream(GZIPInputStream(FileInputStream(archive), 64 * 1024)).use { input ->
      val magic = ByteArray(6)
      input.readFully(magic)
      if (String(magic, Charsets.US_ASCII) != "FOTA1\n") throw FireOTAException("invalid_package", "Not a FireOTA package.")
      val headerLength = input.readInt()
      if (headerLength <= 0 || headerLength > 4 * 1024 * 1024) throw FireOTAException("invalid_package", "Invalid package header.")
      val header = ByteArray(headerLength)
      input.readFully(header)
      val files = JSONObject(String(header, Charsets.UTF_8)).getJSONArray("files")
      // Refuse decompression bombs before writing anything.
      if (files.length() > MAX_FILES) throw FireOTAException("invalid_package", "The update package has too many files.")
      var unpacked = 0L
      for (i in 0 until files.length()) {
        val size = files.getJSONObject(i).getLong("size")
        if (size < 0) throw FireOTAException("invalid_package", "Invalid package header.")
        unpacked += size
      }
      if (unpacked > UNPACKED_LIMIT) throw FireOTAException("too_large", "The update unpacks to more than the limit.")
      val base = into.canonicalFile
      base.mkdirs()
      for (i in 0 until files.length()) {
        val entry = files.getJSONObject(i)
        val path = entry.getString("path")
        val size = entry.getLong("size")
        val out = File(base, path).canonicalFile
        if (path.startsWith("/") || path.contains("..") || !out.path.startsWith(base.path + File.separator)) {
          throw FireOTAException("invalid_package", "Unsafe path in update package: $path")
        }
        out.parentFile?.mkdirs()
        FileOutputStream(out).use { output ->
          var remaining = size
          val buffer = ByteArray(64 * 1024)
          while (remaining > 0) {
            val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
            if (read < 0) throw FireOTAException("invalid_package", "Truncated update package.")
            output.write(buffer, 0, read)
            remaining -= read
          }
        }
      }
    }
  }

  fun versionName(): String = packageInfo()?.versionName ?: ""

  fun versionCode(): Long {
    val info = packageInfo() ?: return 0
    return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
  }

  private fun binaryVersion(): String {
    val info = packageInfo() ?: return ""
    return "${info.versionName}-${versionCode()}-${info.lastUpdateTime}"
  }

  private fun packageInfo(): PackageInfo? = try {
    app.packageManager.getPackageInfo(app.packageName, 0)
  } catch (_: PackageManager.NameNotFoundException) {
    null
  }

  private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9_-]"), "")

  companion object {
    const val DESCRIPTOR = "fireota.json"
    const val KIND_AOT = "flutter-aot"
    const val KEY_INSTALLATION = "installationId"
    const val KEY_BINARY = "binary"
    const val KEY_CURRENT = "current"
    const val KEY_PREVIOUS = "previous"
    const val KEY_PENDING = "pending"
    const val KEY_DOWNLOADED = "downloaded"
    const val KEY_FAILED = "failed"
    const val KEY_FAILED_REASON = "failedReason"
    const val KEY_UNCONFIRMED = "unconfirmed"
    const val KEY_ATTEMPTS = "attempts"
    const val KEY_CODE_PUSH = "codePush"
    const val KEY_FINGERPRINT = "baseFingerprint"
    const val KEY_BLOCKED = "blocked"

    /** Absolute caps, whatever the app configures. */
    const val HARD_LIMIT = 512L * 1024 * 1024
    const val UNPACKED_LIMIT = 1024L * 1024 * 1024
    const val MAX_FILES = 20_000

    private fun sha256(input: InputStream): String {
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
      return hex(digest.digest())
    }

    private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
  }
}
