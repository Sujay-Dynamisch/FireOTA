// Minimal surface used by the SDK, for type-checking inside the FireOTA repo only.
// Consumers get the real types from their react-native installation.
declare module "react-native" {
  import type { ComponentType, ReactNode } from "react";

  type Style = Record<string, unknown> | undefined | false | null;
  interface Common {
    style?: Style | Style[];
    children?: ReactNode;
  }

  export const NativeModules: Record<string, unknown>;
  export const Platform: { OS: "android" | "ios" | "web" | "windows" | "macos" };
  export const View: ComponentType<Common & { pointerEvents?: "box-none" | "none" | "auto" | "box-only" }>;
  export const Text: ComponentType<Common & { numberOfLines?: number; selectable?: boolean }>;
  export const ScrollView: ComponentType<Common & { contentContainerStyle?: Style }>;
  export const Pressable: ComponentType<
    Common & { onPress?: () => void; disabled?: boolean; accessibilityRole?: string }
  >;
  export const ActivityIndicator: ComponentType<{ color?: string; size?: "small" | "large" }>;
  export const Modal: ComponentType<
    Common & { visible?: boolean; transparent?: boolean; animationType?: string; statusBarTranslucent?: boolean }
  >;
  export const StyleSheet: { create<T extends Record<string, Record<string, unknown>>>(styles: T): T };
}
