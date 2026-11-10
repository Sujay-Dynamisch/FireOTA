import 'dart:convert';
import 'dart:typed_data';

/// The message the CLI signs, the server verifies and the device checks.
String signatureMessage(String runtimeVersion, String platform, String sha256) =>
    'fireota-update-v1\n$runtimeVersion\n$platform\n${sha256.toLowerCase()}';

/// The certificate is a PEM `PUBLIC KEY` (X.509 SubjectPublicKeyInfo). Android accepts that
/// directly; iOS's SecKeyCreateWithData wants the inner PKCS#1 RSAPublicKey.
String publicKeyForPlatform(String pem, String platform) {
  final body = pem.replaceAll(RegExp(r'-----[^-]+-----'), '').replaceAll(RegExp(r'\s'), '');
  final spki = base64.decode(body);
  if (platform != 'ios') return base64.encode(spki);
  final outer = _element(spki, 0);
  final algorithm = _element(spki, outer.start);
  final bitString = _element(spki, algorithm.end);
  if (outer.tag != 0x30 || algorithm.tag != 0x30 || bitString.tag != 0x03) {
    throw const FormatException('Invalid code signing certificate.');
  }
  // Skip the BIT STRING's unused-bits byte.
  return base64.encode(spki.sublist(bitString.start + 1, bitString.end));
}

class _Der {
  const _Der(this.tag, this.start, this.end);
  final int tag;
  final int start;
  final int end;
}

/// Reads one DER element header: where its content starts and ends.
_Der _element(Uint8List der, int offset) {
  if (offset + 1 >= der.length) throw const FormatException('Invalid code signing certificate.');
  var length = der[offset + 1];
  var start = offset + 2;
  if (length & 0x80 != 0) {
    final count = length & 0x7f;
    length = 0;
    for (var i = 0; i < count; i++) {
      length = (length << 8) | der[start + i];
    }
    start += count;
  }
  if (start + length > der.length) throw const FormatException('Invalid code signing certificate.');
  return _Der(der[offset], start, start + length);
}
