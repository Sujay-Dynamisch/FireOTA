/**
 * Code signing (optional, per app). The private key stays on this machine or in your CI's
 * secret store; FireOTA and the app only ever see the public key.
 *
 * Signed message — identical in the server and the SDK:
 *   fireota-update-v1\n<runtimeVersion>\n<platform>\n<sha256 of the .fota package, hex>
 */
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function signatureMessage({ runtimeVersion, platform, sha256 }) {
  return `fireota-update-v1\n${runtimeVersion}\n${platform}\n${sha256.toLowerCase()}`;
}

/** --private-key <file>, or FIREOTA_SIGNING_KEY (PEM text) / FIREOTA_SIGNING_KEY_PATH in CI. */
export function loadPrivateKey(flagPath) {
  const path = flagPath ?? process.env.FIREOTA_SIGNING_KEY_PATH;
  const pem = path ? readFileSync(resolve(String(path)), "utf8") : process.env.FIREOTA_SIGNING_KEY;
  if (!pem) return null;
  // CI secret stores often turn newlines into literal "\n".
  const key = createPrivateKey(pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem);
  if (key.asymmetricKeyType !== "rsa") throw new Error("The signing key must be an RSA private key.");
  return key;
}

export function signUpdate(privateKey, input) {
  return sign("sha256", Buffer.from(signatureMessage(input), "utf8"), privateKey).toString("base64");
}

export function generateKeys(outDir) {
  const dir = resolve(outDir ?? "fireota-keys");
  const privatePath = join(dir, "fireota-private.pem");
  const publicPath = join(dir, "fireota-public.pem");
  if (existsSync(privatePath) || existsSync(publicPath)) {
    throw new Error(`${dir} already contains FireOTA keys. Refusing to overwrite them.`);
  }
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
  writeFileSync(publicPath, publicKey);
  writeFileSync(join(dir, ".gitignore"), "fireota-private.pem\n");
  return { dir, privatePath, publicPath, publicKey };
}
