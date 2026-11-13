import CommonCrypto
import Flutter
import Foundation
import Security
import UIKit
import zlib

/// iOS side of the fireota plugin. iOS runs asset and config updates only: Apple does not allow
/// downloading compiled code, so a code patch is never installed here.
///
/// Patches live in Application Support/fireota/patches/<releaseId>/ (excluded from backups).
/// Launch rules match Android: a new store build discards patches, a pending patch becomes current
/// on the next start, and a patch that reaches a second launch unconfirmed is rolled back.
public class FireOTAPlugin: NSObject, FlutterPlugin {
  private let store = FireOTAStore.shared

  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: "dev.fireota/flutter", binaryMessenger: registrar.messenger())
    let instance = FireOTAPlugin()
    FireOTAStore.shared.resolveLaunch()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "getState":
      result(store.state())
    case "setCodePushEnabled":
      result(nil)
    case "download":
      guard let url = args["url"] as? String, let sha = args["sha256"] as? String, let id = args["releaseId"] as? String else {
        result(FlutterError(code: "invalid_arguments", message: "url, sha256 and releaseId are required.", details: nil))
        return
      }
      let expectedSize = (args["expectedSize"] as? NSNumber)?.int64Value ?? 0
      let maxBytes = (args["maxBytes"] as? NSNumber)?.int64Value ?? 0
      store.download(url: url, sha256: sha, releaseId: id, expectedSize: expectedSize, maxBytes: maxBytes) { error in
        DispatchQueue.main.async { result(error.map { FlutterError(code: $0.code, message: $0.message, details: nil) }) }
      }
    case "verifySignature":
      result(Self.verify(
        message: args["message"] as? String ?? "",
        signature: args["signature"] as? String ?? "",
        publicKey: args["publicKey"] as? String ?? ""
      ))
    case "install":
      if let error = store.setPending(args["releaseId"] as? String ?? "") {
        result(FlutterError(code: error.code, message: error.message, details: nil))
      } else {
        result(nil)
      }
    case "markSuccess":
      store.markSuccess()
      result(["ok": true])
    case "clearPending":
      store.clear([FireOTAStore.kPending, FireOTAStore.kDownloaded])
      result(nil)
    case "clearFailed":
      store.clear([FireOTAStore.kFailed, FireOTAStore.kFailedReason])
      result(nil)
    case "assetPath":
      result(store.assetPath(args["path"] as? String ?? ""))
    case "config":
      result(store.config())
    case "restart":
      // iOS apps cannot relaunch themselves. Asset updates apply in place instead: the pending
      // patch becomes current now and the Dart side reloads assets and config.
      store.promotePendingNow()
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  /// RSA-SHA256 (PKCS#1 v1.5) against the app's public key, passed as base64 PKCS#1.
  static func verify(message: String, signature: String, publicKey: String) -> Bool {
    guard let keyData = Data(base64Encoded: publicKey),
          let signatureData = Data(base64Encoded: signature),
          let payload = message.data(using: .utf8) else { return false }
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeyClass as String: kSecAttrKeyClassPublic,
    ]
    guard let key = SecKeyCreateWithData(keyData as CFData, attributes as CFDictionary, nil) else { return false }
    return SecKeyVerifySignature(
      key, .rsaSignatureMessagePKCS1v15SHA256, payload as CFData, signatureData as CFData, nil
    )
  }
}

struct FireOTAError: Error {
  let code: String
  let message: String
}

final class FireOTAStore {
  static let shared = FireOTAStore()

  static let kInstallation = "installationId"
  static let kBinary = "binary"
  static let kCurrent = "current"
  static let kPrevious = "previous"
  static let kPending = "pending"
  static let kDownloaded = "downloaded"
  static let kFailed = "failed"
  static let kFailedReason = "failedReason"
  static let kUnconfirmed = "unconfirmed"
  static let kAttempts = "attempts"
  static let kBlocked = "blocked"

  private let defaults = UserDefaults(suiteName: "dev.fireota.flutter") ?? .standard
  private let fm = FileManager.default
  private var resolved = false

  private var root: URL {
    let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    var url = base.appendingPathComponent("fireota/patches", isDirectory: true)
    try? fm.createDirectory(at: url, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? url.setResourceValues(values)
    return url
  }

  func patchDir(_ id: String) -> URL { root.appendingPathComponent(safe(id), isDirectory: true) }

  private func hasPatch(_ id: String?) -> Bool {
    guard let id else { return false }
    return fm.fileExists(atPath: patchDir(id).appendingPathComponent("fireota.json").path)
  }

  var installationId: String {
    if let value = defaults.string(forKey: Self.kInstallation) { return value }
    let value = UUID().uuidString.lowercased()
    defaults.set(value, forKey: Self.kInstallation)
    return value
  }

  private var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }
  private var appVersion: String { info["CFBundleShortVersionString"] as? String ?? "" }
  private var buildNumber: String { info["CFBundleVersion"] as? String ?? "" }

  /// Changes whenever the store build changes, including a reinstall.
  private var binaryVersion: String {
    let executable = Bundle.main.executableURL?.path ?? ""
    let modified = (try? fm.attributesOfItem(atPath: executable)[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
    return "\(appVersion)-\(buildNumber)-\(Int(modified))"
  }

  func resolveLaunch() {
    if resolved { return }
    resolved = true
    if defaults.string(forKey: Self.kBinary) != binaryVersion {
      try? fm.removeItem(at: root)
      clear([Self.kCurrent, Self.kPrevious, Self.kPending, Self.kDownloaded, Self.kBlocked])
      defaults.set(false, forKey: Self.kUnconfirmed)
      defaults.set(0, forKey: Self.kAttempts)
      defaults.set(binaryVersion, forKey: Self.kBinary)
    }
    promotePending()
    if defaults.bool(forKey: Self.kUnconfirmed) {
      let attempts = defaults.integer(forKey: Self.kAttempts) + 1
      if attempts >= 2 { rollBack(reason: "launch_not_confirmed") } else { defaults.set(attempts, forKey: Self.kAttempts) }
    }
    if let current = defaults.string(forKey: Self.kCurrent), !hasPatch(current) {
      defaults.removeObject(forKey: Self.kCurrent)
      defaults.set(false, forKey: Self.kUnconfirmed)
    }
  }

  private func promotePending() {
    guard let pending = defaults.string(forKey: Self.kPending) else { return }
    defaults.removeObject(forKey: Self.kPending)
    guard hasPatch(pending) else { return }
    defaults.set(defaults.string(forKey: Self.kCurrent), forKey: Self.kPrevious)
    defaults.set(pending, forKey: Self.kCurrent)
    defaults.set(true, forKey: Self.kUnconfirmed)
    defaults.set(0, forKey: Self.kAttempts)
  }

  /// Asset updates do not need a new process, so they can apply while the app runs.
  func promotePendingNow() {
    promotePending()
    defaults.set(false, forKey: Self.kUnconfirmed)
  }

  private func rollBack(reason: String) {
    let failed = defaults.string(forKey: Self.kCurrent)
    if let failed {
      var blocked = defaults.stringArray(forKey: Self.kBlocked) ?? []
      blocked.append(failed)
      defaults.set(blocked, forKey: Self.kBlocked)
      try? fm.removeItem(at: patchDir(failed))
    }
    defaults.set(failed, forKey: Self.kFailed)
    defaults.set(reason, forKey: Self.kFailedReason)
    defaults.set(defaults.string(forKey: Self.kPrevious), forKey: Self.kCurrent)
    defaults.removeObject(forKey: Self.kPrevious)
    defaults.set(false, forKey: Self.kUnconfirmed)
    defaults.set(0, forKey: Self.kAttempts)
  }

  func state() -> [String: Any?] {
    [
      "platform": "ios",
      "installationId": installationId,
      "appVersion": appVersion,
      "buildNumber": buildNumber,
      "abi": "",
      "baseFingerprint": "",
      "currentReleaseId": defaults.string(forKey: Self.kCurrent),
      "pendingReleaseId": defaults.string(forKey: Self.kPending),
      "downloadedReleaseId": defaults.string(forKey: Self.kDownloaded),
      "failedReleaseId": defaults.string(forKey: Self.kFailed),
      "failedReason": defaults.string(forKey: Self.kFailedReason),
      "blockedReleaseIds": defaults.stringArray(forKey: Self.kBlocked) ?? [],
      "isFirstRun": defaults.bool(forKey: Self.kUnconfirmed),
      "codePushApplied": false,
      "skipped": nil,
    ]
  }

  func markSuccess() {
    defaults.set(false, forKey: Self.kUnconfirmed)
    defaults.set(0, forKey: Self.kAttempts)
    let keep = Set([Self.kCurrent, Self.kPrevious, Self.kPending, Self.kDownloaded].compactMap { defaults.string(forKey: $0) }.map(safe))
    for dir in (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? [] where !keep.contains(dir.lastPathComponent) {
      try? fm.removeItem(at: dir)
    }
  }

  func setPending(_ id: String) -> FireOTAError? {
    guard hasPatch(id) else { return FireOTAError(code: "not_downloaded", message: "This release has not been downloaded.") }
    defaults.set(id, forKey: Self.kPending)
    defaults.removeObject(forKey: Self.kDownloaded)
    return nil
  }

  func clear(_ keys: [String]) { keys.forEach { defaults.removeObject(forKey: $0) } }

  func assetPath(_ relative: String) -> String? {
    guard let current = defaults.string(forKey: Self.kCurrent) else { return nil }
    let base = patchDir(current).appendingPathComponent("assets", isDirectory: true).standardizedFileURL.path
    let file = URL(fileURLWithPath: base).appendingPathComponent(relative).standardizedFileURL.path
    guard file.hasPrefix(base + "/"), fm.fileExists(atPath: file) else { return nil }
    return file
  }

  func config() -> String? {
    guard let current = defaults.string(forKey: Self.kCurrent) else { return nil }
    return try? String(contentsOf: patchDir(current).appendingPathComponent("config.json"), encoding: .utf8)
  }

  /// Absolute caps, whatever the app configures.
  static let hardLimit: Int64 = 512 * 1024 * 1024
  static let unpackedLimit: Int64 = 1024 * 1024 * 1024
  static let maxFiles = 20_000

  func download(
    url urlString: String,
    sha256 expected: String,
    releaseId: String,
    expectedSize: Int64 = 0,
    maxBytes: Int64 = 0,
    completion: @escaping (FireOTAError?) -> Void
  ) {
    guard let url = URL(string: urlString), url.scheme == "https" else {
      completion(FireOTAError(code: "insecure_url", message: "Updates must be downloaded over HTTPS."))
      return
    }
    let limit = maxBytes > 0 && maxBytes < Self.hardLimit ? maxBytes : Self.hardLimit
    if expectedSize > limit {
      completion(FireOTAError(code: "too_large", message: "The update is larger than the download limit."))
      return
    }
    let needed = (expectedSize > 0 ? expectedSize : limit / 4) * 3
    if let free = (try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?.volumeAvailableCapacityForImportantUsage,
       free > 0, free < needed {
      completion(FireOTAError(code: "insufficient_storage", message: "Not enough free storage for the update."))
      return
    }
    if (defaults.stringArray(forKey: Self.kBlocked) ?? []).contains(releaseId) {
      completion(FireOTAError(code: "blocked", message: "This patch failed on this device before."))
      return
    }
    URLSession.shared.downloadTask(with: url) { location, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard error == nil, let location, (200...299).contains(status) else {
        completion(FireOTAError(code: "download_failed", message: "Download failed (HTTP \(status))."))
        return
      }
      let size = ((try? FileManager.default.attributesOfItem(atPath: location.path))?[.size] as? NSNumber)?.int64Value ?? -1
      if size > limit || (expectedSize > 0 && size > expectedSize) {
        completion(FireOTAError(code: "too_large", message: "The update is larger than announced."))
        return
      }
      if expectedSize > 0 && size != expectedSize {
        completion(FireOTAError(code: "size_mismatch", message: "The update is smaller than announced."))
        return
      }
      guard Self.sha256(of: location) == expected.lowercased() else {
        completion(FireOTAError(code: "checksum_mismatch", message: "Checksum mismatch: the update was rejected."))
        return
      }
      let staging = self.root.appendingPathComponent(".\(self.safe(releaseId)).staging", isDirectory: true)
      try? self.fm.removeItem(at: staging)
      if let problem = Self.unpack(location, into: staging) {
        try? self.fm.removeItem(at: staging)
        completion(FireOTAError(code: "invalid_package", message: problem))
        return
      }
      let descriptor = staging.appendingPathComponent("fireota.json")
      guard let data = try? Data(contentsOf: descriptor),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        try? self.fm.removeItem(at: staging)
        completion(FireOTAError(code: "invalid_package", message: "The update package has no fireota.json."))
        return
      }
      if json["kind"] as? String == "flutter-aot" {
        try? self.fm.removeItem(at: staging)
        completion(FireOTAError(code: "unsupported_platform", message: "Code patches are not supported on iOS."))
        return
      }
      let target = self.patchDir(releaseId)
      try? self.fm.removeItem(at: target)
      do {
        try self.fm.moveItem(at: staging, to: target)
      } catch {
        completion(FireOTAError(code: "storage_failed", message: "Could not store the update."))
        return
      }
      self.defaults.set(releaseId, forKey: Self.kDownloaded)
      completion(nil)
    }.resume()
  }

  private func safe(_ id: String) -> String { id.filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" } }

  static func sha256(of url: URL) -> String {
    guard let stream = InputStream(url: url) else { return "" }
    stream.open()
    defer { stream.close() }
    var context = CC_SHA256_CTX()
    CC_SHA256_Init(&context)
    var buffer = [UInt8](repeating: 0, count: 65536)
    while true {
      let read = stream.read(&buffer, maxLength: buffer.count)
      if read <= 0 { break }
      CC_SHA256_Update(&context, buffer, CC_LONG(read))
    }
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    CC_SHA256_Final(&digest, &context)
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  /// FireOTA package: gzip("FOTA1\n" | u32 big-endian header length | JSON {files:[{path,size}]} | bytes).
  /// Paths are validated so a package can never write outside its patch directory.
  static func unpack(_ archive: URL, into dir: URL) -> String? {
    guard let gz = gzopen(archive.path, "rb") else { return "Could not open the update package." }
    defer { gzclose(gz) }
    func read(_ count: Int) -> Data? {
      var data = Data(count: count)
      let got = data.withUnsafeMutableBytes { gzread(gz, $0.baseAddress, UInt32(count)) }
      return got == Int32(count) ? data : nil
    }
    guard let magic = read(6), String(data: magic, encoding: .ascii) == "FOTA1\n", let lengthBytes = read(4) else {
      return "Not a FireOTA package."
    }
    let length = lengthBytes.reduce(0) { ($0 << 8) | Int($1) }
    guard length > 0, length <= 4 * 1024 * 1024, let header = read(length),
          let json = try? JSONSerialization.jsonObject(with: header) as? [String: Any],
          let files = json["files"] as? [[String: Any]] else { return "Invalid package header." }
    // Refuse decompression bombs before writing anything.
    if files.count > maxFiles { return "The update package has too many files." }
    var unpacked: Int64 = 0
    for entry in files {
      guard let size = (entry["size"] as? NSNumber)?.int64Value, size >= 0 else { return "Invalid package header." }
      unpacked += size
    }
    if unpacked > unpackedLimit { return "The update unpacks to more than the limit." }
    let fm = FileManager.default
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    let base = dir.standardizedFileURL.path
    for entry in files {
      guard let path = entry["path"] as? String, let size = (entry["size"] as? NSNumber)?.intValue else {
        return "Invalid package header."
      }
      let out = URL(fileURLWithPath: base).appendingPathComponent(path).standardizedFileURL.path
      if path.hasPrefix("/") || path.contains("..") || !out.hasPrefix(base + "/") {
        return "Unsafe path in update package: \(path)"
      }
      try? fm.createDirectory(atPath: (out as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
      fm.createFile(atPath: out, contents: nil)
      guard let handle = FileHandle(forWritingAtPath: out) else { return "Could not store the update." }
      var remaining = size
      while remaining > 0 {
        let chunk = min(65536, remaining)
        guard let data = read(chunk) else {
          handle.closeFile()
          return "Truncated update package."
        }
        handle.write(data)
        remaining -= chunk
      }
      handle.closeFile()
    }
    return nil
  }
}
