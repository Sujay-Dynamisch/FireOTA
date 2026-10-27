/**
 * Product changelog. Newest first. Each entry renders on /changelog, gets its own page at
 * /changelog/<slug>, and is published in the RSS feed at /changelog.xml.
 * Body blocks are plain data so the same content works in HTML and RSS.
 */

export interface ChangelogAuthor {
  name: string;
  avatar: string;
  url: string;
}

export type ChangelogBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; code: string };

export interface ChangelogEntry {
  slug: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  title: string;
  summary: string;
  tags: string[];
  authors: ChangelogAuthor[];
  body: ChangelogBlock[];
}

const SUJAL: ChangelogAuthor = {
  name: "Sujal Khedekar",
  avatar: "https://github.com/Sujay-Dynamisch.png?size=64",
  url: "https://github.com/Sujay-Dynamisch",
};

export const changelog: ChangelogEntry[] = [
  {
    slug: "fireota-cli-0-5-0",
    date: "2026-10-27",
    title: "CLI 0.5.0: Expo Updates without EAS, and Archive / Delete in Releases",
    summary:
      "Apps that use expo-updates can now get OTA updates from FireOTA instead of EAS Update, with bundles stored in your own Firebase Storage. The Releases list can archive and delete updates.",
    tags: ["CLI 0.5.0", "Expo", "Dashboard"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Expo Updates, served by FireOTA" },
      {
        type: "p",
        text: "FireOTA now speaks the Expo Updates protocol. Keep expo-updates in your app, point updates.url at your FireOTA manifest URL and publish with --expo. You don't need the FireOTA SDK or any native change.",
      },
      {
        type: "code",
        code: 'npm install -D @fireota/cli@0.5.0\nnpx fireota publish --expo --app <appId> --platform android --channel production --message "Fix checkout"',
      },
      {
        type: "list",
        items: [
          "Channels, percentage rollouts and rollbacks work as they do for SDK apps.",
          "Bundles and assets are uploaded to your own Firebase Storage bucket.",
          "A rollback with no newer update sends the device back to the bundle built into the app.",
          "Installs are reported automatically when a device starts running an update.",
        ],
      },
      { type: "h", text: "Archive and delete from the Releases list" },
      {
        type: "p",
        text: "Each release row now has Archive and Delete buttons. Before you confirm, the dialog shows the update number, channel and status. Live updates must be archived before they can be deleted, and you type DELETE to confirm a delete. The status filter also gains Failed and Archived.",
      },
    ],
  },
  {
    slug: "fireota-0-4-0",
    date: "2026-10-26",
    title: "FireOTA 0.4.0: update screen templates, docs search and Ask AI",
    summary:
      "@fireota/react-native and @fireota/cli 0.4.0 ship ready-made update screen templates in the package, and the docs get instant search, an AI assistant and this changelog.",
    tags: ["SDK 0.4.0", "CLI 0.4.0", "Docs"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Update screen templates in the package" },
      {
        type: "p",
        text: "Four ready-made screens now come with npm install, in node_modules/@fireota/react-native/templates. Copy one into your app and restyle it as you like:",
      },
      {
        type: "list",
        items: [
          "RequiredUpdateScreen — full-screen notice for mandatory updates.",
          "UpdateDialog — a centred “Update available” dialog.",
          "UpdateSheet — a bottom sheet with the update message.",
          "UpdatesSettingsCard — an “App updates” card for your settings screen.",
        ],
      },
      { type: "code", code: "npm install @fireota/react-native@0.4.0 @fireota/cli@0.4.0" },
      { type: "h", text: "Docs: Search and Ask AI" },
      {
        type: "list",
        items: [
          "Search or Ask AI (Ctrl/⌘ K): instant search over every page and section.",
          "Ask AI answers from the documentation and links the sections it used.",
          "A changelog with an RSS feed, a GitHub star button and an Auto / Light / Dark theme switch.",
        ],
      },
    ],
  },
  {
    slug: "expo-support",
    date: "2026-10-26",
    title: "Expo support with a config plugin",
    summary:
      "FireOTA now works in Expo apps (SDK 50+) with development and release builds and EAS Build. A config plugin re-applies the native setup on every prebuild.",
    tags: ["Expo", "SDK 0.4.0", "CLI 0.4.0"],
    authors: [SUJAL],
    body: [
      {
        type: "p",
        text: "Expo SDK 50 and newer are supported with development and release builds (npx expo run:android, EAS Build). Expo Go is not supported, because it cannot load native code.",
      },
      { type: "code", code: "npx expo install @fireota/react-native\nnpm install --save-dev @fireota/cli\nnpx fireota init" },
      { type: "h", text: "What fireota init does in an Expo project" },
      {
        type: "list",
        items: [
          "Adds the config plugin to app.json, so every expo prebuild and EAS Build re-applies the native change. android/ and ios/ don't need to be committed.",
          "Wraps your root component with withFireOTA: the root layout (app/_layout.tsx) with expo-router, otherwise registerRootComponent(App).",
          "Uses expo.version from app.json as the runtime version.",
        ],
      },
      { type: "code", code: '{ "expo": { "plugins": ["@fireota/react-native"] } }' },
      { type: "h", text: "Publishing" },
      {
        type: "p",
        text: "fireota publish bundles Expo apps with expo export:embed and the same entry point as the native build, expo-router included.",
      },
      {
        type: "p",
        text: "expo-updates must not be installed alongside FireOTA, because both replace the bundle at launch. The plugin stops the build if it finds it; set { \"allowExpoUpdates\": true } in the plugin options while migrating.",
      },
    ],
  },
  {
    slug: "agent-chat-history-and-update-screens",
    date: "2026-10-25",
    title: "Agent chat history and ready-made update screens",
    summary:
      "Agent conversations are saved with a history sidebar, and the docs now show every built-in update screen.",
    tags: ["Agents", "SDK", "Docs"],
    authors: [SUJAL],
    body: [
      {
        type: "p",
        text: "Conversations with your FireOTA agents are now saved. A ChatGPT-style sidebar lists past chats so you can pick up where you left off.",
      },
      { type: "h", text: "Ready-made update screens" },
      {
        type: "p",
        text: "The documentation has a new page showing every screen that ships with @fireota/react-native — the update prompt, the mandatory-update notice and the full App updates screen — with code to restyle or replace each one.",
      },
    ],
  },
  {
    slug: "multi-turn-agent-chat",
    date: "2026-10-21",
    title: "Multi-turn agent chat — agents can create channels and releases",
    summary:
      "Talk to agents across several messages; they can now create channels and releases, with approval for anything risky.",
    tags: ["Agents"],
    authors: [SUJAL],
    body: [
      {
        type: "p",
        text: "Agents now keep the context of the whole conversation, so you can refine a request step by step instead of starting over.",
      },
      {
        type: "list",
        items: [
          "New tools: create channels and create releases.",
          "Write actions still follow each agent's per-tool mode: Allowed, Needs approval or Denied.",
          "An agent never has more rights than the member asking it.",
        ],
      },
    ],
  },
  {
    slug: "detailed-setup-guides",
    date: "2026-10-21",
    title: "Detailed setup guides with illustrations",
    summary:
      "Every setup step in the docs is expanded and illustrated, plus a new page on customizing the update prompt.",
    tags: ["Docs", "Dashboard"],
    authors: [SUJAL],
    body: [
      {
        type: "p",
        text: "The setup documentation has been expanded with an illustration for each step, from preparing Firebase to publishing your first update.",
      },
      {
        type: "list",
        items: [
          "New page: Customize the update prompt.",
          "Settings: pick the default channel from your existing channels.",
          "Buttons show a loading state while an action runs.",
        ],
      },
    ],
  },
  {
    slug: "fireota-init",
    date: "2026-10-19",
    title: "One-command setup with fireota init",
    summary:
      "@fireota/react-native and @fireota/cli 0.3.0: two commands to set up a project, a built-in update UI, and the runtime version read from your store version.",
    tags: ["SDK 0.3.0", "CLI 0.3.0"],
    authors: [SUJAL],
    body: [
      { type: "p", text: "Setting up FireOTA in a React Native app now takes two commands:" },
      { type: "code", code: "npm install @fireota/react-native @fireota/cli\nnpx fireota init" },
      {
        type: "p",
        text: "fireota init creates fireota.config.js, wraps your root component with the built-in update UI, wires MainApplication and AppDelegate for release builds, and adds an ota:publish script. It never overwrites anything and lists every change.",
      },
      { type: "h", text: "Built-in update UI" },
      {
        type: "list",
        items: [
          "<UpdatePrompt /> — a “Restart to update” card and a full-screen notice for mandatory updates.",
          "<UpdateScreen /> — a complete App updates screen.",
          "useFireOTA() — state and actions to build your own UI.",
        ],
      },
      { type: "h", text: "Runtime version from your store version" },
      {
        type: "p",
        text: "Like Expo's appVersion policy, the runtime version now defaults to Android versionName / iOS CFBundleShortVersionString. Neither the app config nor fireota publish needs --runtime any more.",
      },
      {
        type: "p",
        text: "Also in this release: Google sign-in is more robust, and expired sessions redirect to the login page.",
      },
    ],
  },
  {
    slug: "admin-security-signing-agents",
    date: "2026-10-16",
    title: "Admin controls, code signing, AI agents and security alerts",
    summary:
      "SDK and CLI 0.2.0: Expo-style update IDs, optional code signing, custom roles, bring-your-own-key agents and malicious-activity detection.",
    tags: ["SDK 0.2.0", "CLI 0.2.0", "Security"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Updates identified by ID" },
      {
        type: "p",
        text: "Like Expo, every update now has its own ID and a message. Each update targets exactly one runtime version; the app page shows updates grouped by store build.",
      },
      { type: "h", text: "Code signing" },
      {
        type: "p",
        text: "Optional per app. Generate keys with npx fireota signing generate; the server and the app reject updates whose RSA-SHA256 signature does not match.",
      },
      { type: "h", text: "Admin and team" },
      {
        type: "list",
        items: [
          "Custom roles with any mix of permissions; suspend, reactivate and remove members.",
          "Admin-only API keys with expiry and delete.",
          "Create, edit, pause and delete channels.",
          "Delete applications and remove Firebase projects.",
        ],
      },
      { type: "h", text: "Agents and security" },
      {
        type: "list",
        items: [
          "Bring your own Claude or OpenAI key for three built-in agents.",
          "A Security page that flags destructive bursts, leaked keys, privilege changes and invalid signatures.",
          "Notifications for every workspace activity, with per-member read state and preferences.",
        ],
      },
      {
        type: "p",
        text: "The CLI now detects commit, branch and build number on every major CI tool.",
      },
    ],
  },
  {
    slug: "new-logo-and-product-tour",
    date: "2026-10-15",
    title: "New logo, product tour and session-aware site",
    summary:
      "A new FireOTA mark, an interactive landing page with the product walkthrough, and pages that know when you are signed in.",
    tags: ["Website"],
    authors: [SUJAL],
    body: [
      {
        type: "list",
        items: [
          "The new FireOTA logo is used across the site, dashboard and docs.",
          "The landing page has an interactive rollout simulator and the product walkthrough video.",
          "The landing and auth pages show your account when you are already signed in.",
          "Connecting Firebase always asks for Google consent, and analytics totals are now exact.",
        ],
      },
    ],
  },
  {
    slug: "fireota-beta",
    date: "2026-10-14",
    title: "FireOTA beta: dashboard, React Native SDK and CLI",
    summary:
      "The first public release: OTA updates for React Native served from your own Firebase project.",
    tags: ["SDK 0.1.0", "CLI 0.1.0"],
    authors: [SUJAL],
    body: [
      {
        type: "p",
        text: "FireOTA ships JavaScript fixes and features to React Native apps without a store review. Bundles live in your own Firebase Storage; FireOTA decides which phone gets which update.",
      },
      {
        type: "list",
        items: [
          "Channels, staged rollouts, pause and instant rollback.",
          "SHA-256 verified downloads and automatic rollback when a new bundle crashes on start.",
          "@fireota/react-native and @fireota/cli published on npm.",
          "Privacy Policy and Terms of Service.",
        ],
      },
      {
        type: "code",
        code: "npm install @fireota/react-native\nnpm install --save-dev @fireota/cli",
      },
    ],
  },
];

export function findEntry(slug: string) {
  return changelog.find((entry) => entry.slug === slug);
}

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
