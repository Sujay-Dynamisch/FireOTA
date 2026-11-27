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
  export const View: ComponentType<
    Common & {
      pointerEvents?: "box-none" | "none" | "auto" | "box-only";
      accessibilityRole?: string;
      accessibilityValue?: { min?: number; max?: number; now?: number };
      accessibilityViewIsModal?: boolean;
    }
  >;
  export const Text: ComponentType<Common & { numberOfLines?: number; selectable?: boolean }>;
  export const ScrollView: ComponentType<Common & { contentContainerStyle?: Style }>;
  export const Pressable: ComponentType<
    Omit<Common, "style"> & {
      style?: Style | Style[] | ((state: { pressed: boolean }) => Style | Style[]);
      onPress?: () => void;
      disabled?: boolean;
      accessibilityRole?: string;
    }
  >;
  export const ActivityIndicator: ComponentType<{ color?: string; size?: "small" | "large" }>;
  export const Modal: ComponentType<
    Common & {
      visible?: boolean;
      transparent?: boolean;
      animationType?: string;
      statusBarTranslucent?: boolean;
      onRequestClose?: () => void;
    }
  >;
  export function useColorScheme(): "light" | "dark" | null | undefined;
  export const DeviceEventEmitter: {
    addListener(event: string, listener: (payload: any) => void): { remove(): void };
  };
  interface AnimatedValue {
    interpolate(config: { inputRange: number[]; outputRange: string[] | number[] }): unknown;
  }
  interface CompositeAnimation {
    start(): void;
    stop(): void;
  }
  export const Animated: {
    Value: new (value: number) => AnimatedValue;
    View: ComponentType<Omit<Common, "style"> & { style?: unknown }>;
    timing(value: AnimatedValue, config: Record<string, unknown>): CompositeAnimation;
    loop(animation: CompositeAnimation): CompositeAnimation;
  };
  export const Easing: {
    cubic: (t: number) => number;
    out(easing: (t: number) => number): (t: number) => number;
    inOut(easing: (t: number) => number): (t: number) => number;
  };
  export const StyleSheet: { create<T extends Record<string, Record<string, unknown>>>(styles: T): T };
}

declare const __DEV__: boolean;
