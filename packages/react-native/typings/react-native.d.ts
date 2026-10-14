// Minimal surface used by the SDK, for type-checking inside the FireOTA repo only.
// Consumers get the real types from their react-native installation.
declare module "react-native" {
  export const NativeModules: Record<string, unknown>;
  export const Platform: { OS: "android" | "ios" | "web" | "windows" | "macos" };
}
