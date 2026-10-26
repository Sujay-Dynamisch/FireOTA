/** Reads facts about the React Native project the CLI runs in. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** android/app/build.gradle(.kts): versionName "1.3.3" / versionName = "1.3.3" */
export function androidVersionName(root = ".") {
  for (const file of ["android/app/build.gradle", "android/app/build.gradle.kts"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const match = /versionName\s*=?\s*["']([^"']+)["']/.exec(readFileSync(path, "utf8"));
    if (match) return match[1];
  }
  return undefined;
}

/** ios/<App>.xcodeproj/project.pbxproj MARKETING_VERSION, or a literal CFBundleShortVersionString. */
export function iosMarketingVersion(root = ".") {
  const ios = join(root, "ios");
  if (!existsSync(ios)) return undefined;
  for (const entry of readdirSync(ios)) {
    if (!entry.endsWith(".xcodeproj")) continue;
    const pbx = join(ios, entry, "project.pbxproj");
    if (!existsSync(pbx)) continue;
    const match = /MARKETING_VERSION\s*=\s*"?([0-9][^";]*)"?;/.exec(readFileSync(pbx, "utf8"));
    if (match) return match[1].trim();
  }
  for (const entry of readdirSync(ios)) {
    const plist = join(ios, entry, "Info.plist");
    if (!existsSync(plist)) continue;
    const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<$]+)<\/string>/.exec(readFileSync(plist, "utf8"));
    if (match) return match[1].trim();
  }
  return undefined;
}

/** True for Expo projects (the `expo` package is a dependency). */
export function isExpoProject(root = ".") {
  const path = join(root, "package.json");
  if (!existsSync(path)) return false;
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  return Boolean(pkg.dependencies?.expo ?? pkg.devDependencies?.expo);
}

/** The `expo` object of app.json, or null (no app.json, or a dynamic app.config.js / .ts). */
export function readExpoAppJson(root = ".") {
  const path = join(root, "app.json");
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, "utf8"));
  return json.expo ?? json;
}

/** Expo writes `expo.version` into versionName / CFBundleShortVersionString at prebuild. */
export function expoVersion(root = ".") {
  const version = readExpoAppJson(root)?.version;
  return typeof version === "string" && version ? version : undefined;
}

/** The app's store version for a platform — FireOTA's default runtime version. */
export function storeVersion(platform, root = ".") {
  const native = platform === "ios" ? iosMarketingVersion(root) : androidVersionName(root);
  // Expo projects without android/ or ios/ yet (Continuous Native Generation): use app.json.
  return native ?? (isExpoProject(root) ? expoVersion(root) : undefined);
}

/** Recursively finds the first file matching a name test below a directory. */
export function findFile(dir, test, depth = 6) {
  if (!existsSync(dir) || depth < 0) return undefined;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "build" || entry.name === "Pods" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isFile() && test(entry.name)) return path;
    if (entry.isDirectory()) {
      const found = findFile(path, test, depth - 1);
      if (found) return found;
    }
  }
  return undefined;
}
