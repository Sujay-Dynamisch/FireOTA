import { cn } from "@/lib/utils";

export type EcosystemId =
  | "react-native"
  | "firebase"
  | "google-cloud"
  | "expo"
  | "android"
  | "apple"
  | "github"
  | "fastlane"
  | "gitlab"
  | "bitrise";

const NAMES: Record<EcosystemId, string> = {
  "react-native": "React Native",
  firebase: "Firebase",
  "google-cloud": "Google Cloud",
  expo: "Expo",
  android: "Android",
  apple: "Apple iOS",
  github: "GitHub",
  fastlane: "Fastlane",
  gitlab: "GitLab",
  bitrise: "Bitrise",
};

/** Monochrome black marks that need inverting on dark backgrounds. */
const MONO = new Set<EcosystemId>(["expo", "apple", "github"]);

/**
 * Official brand marks (served from /brand/eco) for tools and runtimes in the FireOTA ecosystem.
 */
export function EcosystemLogo({ id, className }: { id: EcosystemId; className?: string }) {
  return (
    <img
      src={`/brand/eco/${id}.svg`}
      alt={NAMES[id]}
      loading="lazy"
      draggable={false}
      className={cn("size-4 shrink-0 object-contain", MONO.has(id) && "dark:invert", className)}
    />
  );
}
