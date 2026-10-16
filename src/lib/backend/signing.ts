/**
 * Optional per-app code signing, modelled on Expo's: the developer holds an RSA private
 * key, the app embeds the matching public key, and every update carries an RSA-SHA256
 * (PKCS#1 v1.5) signature. The private key never reaches FireOTA.
 *
 * Signed message (UTF-8), identical in the CLI and the SDK:
 *   fireota-update-v1\n<runtimeVersion>\n<platform>\n<sha256 of the .fota package, hex>
 * Binding runtime + platform stops a valid signature being replayed onto another build.
 */
import { createHash, createPublicKey, verify } from "node:crypto";

export const SIGNATURE_ALGORITHM = "rsa-v1_5-sha256";

export function signatureMessage(input: {
  runtimeVersion: string;
  platform: string;
  sha256: string;
}) {
  return `fireota-update-v1\n${input.runtimeVersion}\n${input.platform}\n${input.sha256.toLowerCase()}`;
}

/** Validates a PEM public key (RSA, >= 2048 bits) and derives a short, stable key id. */
export function parsePublicKey(pem: string): { pem: string; keyId: string } {
  let key;
  try {
    key = createPublicKey(pem.trim());
  } catch {
    throw new Error("That is not a valid PEM public key.");
  }
  if (key.asymmetricKeyType !== "rsa") throw new Error("Code signing keys must be RSA keys.");
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < 2048) throw new Error("Code signing keys must be at least 2048 bits.");
  const der = key.export({ type: "spki", format: "der" });
  const normalized = key.export({ type: "spki", format: "pem" }).toString().trim();
  return { pem: normalized, keyId: createHash("sha256").update(der).digest("hex").slice(0, 16) };
}

export function verifyUpdateSignature(
  pem: string,
  message: string,
  signatureBase64: string,
): boolean {
  try {
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length < 256) return false;
    return verify("sha256", Buffer.from(message, "utf8"), createPublicKey(pem), signature);
  } catch {
    return false;
  }
}
