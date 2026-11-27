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
    slug: "eas-update-parity",
    date: "2026-11-27",
    title: "EAS Update parity: drop-in CLI commands, expo-updates SDK, and enhanced security",
    summary:
      "FireOTA now provides full command-line and SDK parity for teams migrating from EAS Update: familiar fireota update commands, an expo-updates-compatible Updates API in @fireota/react-native 0.7.0, and security hardening.",
    tags: ["CLI 0.9.0", "React Native 0.7.0", "Flutter 0.3.0", "Security"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Familiar EAS commands and workflow" },
      {
        type: "p",
        text: "You can now use familiar EAS Update commands directly with FireOTA. In FireOTA, an EAS branch maps directly to a channel, and --branch is accepted everywhere as an alias for --channel.",
      },
      {
        type: "code",
        code: `# Publish an update to production (Android + iOS)
fireota update --branch production --message "Fix checkout"

# Publish with staged rollout percentage
fireota update --branch production --message "Roll out new paywall" --rollout-percentage 20

# View, republish, and manage releases
fireota update:list --branch production
fireota update:view <releaseId>
fireota update:republish <releaseId> --destination-branch staging
fireota update:rollback <releaseId>
fireota update:edit <releaseId> --rollout-percentage 50
fireota update:pause <releaseId>
fireota update:resume <releaseId>
fireota update:delete <releaseId>

# Channel management
fireota channel:list
fireota channel:create preview --environment staging
fireota channel:rollout production --percent 50`,
      },
      { type: "h", text: "What's new across FireOTA" },
      {
        type: "list",
        items: [
          "CLI 0.9.0: Added fireota update with --branch, --platform all|android|ios, --rollout-percentage, --private-key-path, --auto, --json, and --non-interactive flags.",
          "CLI Update & Channel Commands: Full suite of update:list, update:view, update:republish, update:rollback, update:edit, update:pause, update:resume, update:delete, and channel:list/create/view/rollout.",
          "React Native SDK 0.7.0: Added expo-updates-style Updates object (checkForUpdateAsync, fetchUpdateAsync, reloadAsync, readLogEntriesAsync, clearLogEntriesAsync) and useUpdates() hook.",
          "Security Hardening: Strict SSRF guards on externalBundle URLs (https only, private and loopback networks blocked), eas-client-id sanitization, and scoped API key least privilege.",
        ],
      },
      { type: "h", text: "EAS to FireOTA command mapping" },
      {
        type: "list",
        items: [
          "eas update → fireota update (--branch <name> maps to channel)",
          "eas update:list → fireota update:list",
          "eas update:view → fireota update:view <id>",
          "eas update:republish → fireota update:republish <id> --destination-channel <name>",
          "eas update:rollback → fireota update:rollback <id>",
          "eas update:edit → fireota update:edit <id> --rollout-percentage <N>",
          "eas update:pause / resume → fireota update:pause / fireota update:resume",
          "eas update:delete → fireota update:delete <id>",
          "eas channel:list / create / view → fireota channel:list / channel:create / channel:view",
          "eas channel:rollout → fireota channel:rollout <name> --percent <N>",
        ],
      },
      { type: "h", text: "Works in more apps, verified on macOS" },
      {
        type: "list",
        items: [
          "CI now builds fresh React Native 0.73, 0.76 and latest apps for iOS and Android, a fresh Expo app, and fresh Flutter 3.22 and stable apps, all set up with fireota init.",
          "Fixed: fireota init produced Android code that did not compile on React Native 0.73 to 0.80.",
          "Flutter: now supports Android 5.0 (API 21) and iOS 12, and apps on Android Gradle Plugin 7, 8 or 9.",
        ],
      },
    ],
  },
  {
    slug: "material-update-dialogs",
    date: "2026-11-16",
    title: "A modern update flow: ask, download with progress, restart",
    summary:
      "The built-in update prompt in the React Native and Flutter SDKs is now a Material 3 dialog flow that follows your app's light or dark theme, with a real download progress bar.",
    tags: ["React Native 0.6.0", "Flutter 0.3.0", "UI"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "From a bottom card to a complete flow" },
      {
        type: "list",
        items: [
          "Update available: the release notes, version and download size, with Update and Not now.",
          "Downloading: a progress bar with size and percent on Android and iOS, which the user can hide for optional updates.",
          "Update ready: Restart now or Later. A failed download shows Try again.",
          "Mandatory updates download straight away and cannot be dismissed.",
        ],
      },
      { type: "h", text: "Fits any app" },
      {
        type: "p",
        text: "React Native follows the device's light/dark mode with Material 3 colors; pass theme={{ accent }} to match your brand. Flutter uses your app's Theme. Every label can be changed or translated.",
      },
      { type: "code", code: "// Flutter\nMaterialApp(builder: (context, child) => FireOTAUpdatePrompt(child: child!));\n\n// React Native: nothing to add, <FireOTAProvider> shows it" },
      {
        type: "p",
        text: "New autoDownload option: false waits for the user to tap Update (the React Native provider's default); true downloads in the background and only asks to restart.",
      },
    ],
  },
  {
    slug: "ai-agent-setup",
    date: "2026-11-16",
    title: "Set up FireOTA with your AI coding agent, plus a more secure Flutter SDK",
    summary:
      "One command or one prompt lets Claude Code, Codex, Cursor, Antigravity and other coding agents add FireOTA to a React Native, Expo or Flutter app. Flutter SDK 0.2.0 adds download limits, HTTPS enforcement, progress and hooks.",
    tags: ["AI agents", "CLI 0.8.0", "Flutter 0.2.0", "Security", "Docs"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Set up FireOTA with one command" },
      {
        type: "p",
        text: "Run one command in your project, then ask your agent to set up FireOTA. It adds the FireOTA setup skill where coding agents look for it: .claude/skills for Claude Code, .agents/skills for Codex and other tools that read the Agent Skills standard, and a pointer in AGENTS.md. Commit the files so your whole team gets the same instructions.",
      },
      { type: "code", code: "npx @fireota/cli agent install" },
      { type: "h", text: "…or with one prompt" },
      {
        type: "p",
        text: "Agents that can read the web don't need the command:",
      },
      {
        type: "code",
        code: "Set up FireOTA over-the-air updates in this project.\nFollow https://fireota.creoai.in/skills/fireota/SKILL.md",
      },
      {
        type: "list",
        items: [
          "The agent asks for your FireOTA URL, App ID and channel instead of guessing them.",
          "It detects React Native, Expo or Flutter and runs fireota init, which makes the native changes.",
          "It never writes your API key or private signing key to a file.",
          "It builds the app to check the setup, and publishes an update or adds CI only when you ask.",
        ],
      },
      { type: "h", text: "Flutter SDK 0.2.0: more secure downloads" },
      {
        type: "list",
        items: [
          "Release builds require an https:// server URL; a malformed signing certificate now fails at startup.",
          "Downloads must match the size the server announced and stay under maxDownloadBytes (200 MB by default, 512 MB absolute).",
          "Unpacking refuses oversized packages, and downloads stop when the device is low on storage.",
          "New: download progress on Android, a check when the app returns to the foreground, custom request headers, and an onEvent hook to forward update events to Sentry, Datadog or your analytics.",
        ],
      },
      {
        type: "p",
        text: "Heads-up: apps that point FireOTA at an http:// server now fail at startup in release builds. For local testing, set allowInsecureServer: true, which only works in debug and profile builds.",
      },
    ],
  },
  {
    slug: "flutter-sdk",
    date: "2026-11-10",
    title: "FireOTA for Flutter: Dart code push on Android, asset updates on iOS",
    summary:
      "The new fireota package brings FireOTA to Flutter. Ship Dart code patches to Android users without a Play Store release, update assets and remote config on Android and iOS, with signing, staged rollouts and automatic rollback.",
    tags: ["Flutter", "SDK 0.1.0", "CLI 0.7.0", "Android", "iOS", "Docs"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Dart code push on Android" },
      {
        type: "p",
        text: "Change Dart code, run one command, and users get the new code on their next app start. A code patch is your app's compiled Dart code, built with the same Flutter version as the store build it targets. It works with the standard Flutter engine: no forked Flutter or custom toolchain.",
      },
      {
        type: "code",
        code: "flutter pub add fireota\nfireota init --app <appId> --server-url https://fireota.example.com\n\n# once per store release\nfireota flutter release android\n\n# later, after changing Dart code\nfireota flutter patch android --app <appId> \\\n  --private-key fireota-private.pem --message \"Fix checkout total\" --rollout 10",
      },
      { type: "h", text: "Safe by default" },
      {
        type: "list",
        items: [
          "Code patches are always signed, and the server refuses unsigned ones.",
          "A patch only reaches devices running the exact store build it was compiled for, checked by version, build number and a fingerprint of the compiled code.",
          "A patch that crashes before its first frame is rolled back on the next launch.",
          "If the engine cannot load a patch, the SDK notices that the old code is running, rolls back and reports patch_not_loaded.",
          "Failed patches are never downloaded again on that device, and a new store build clears all patches.",
          "The CLI refuses to build a patch when your Flutter version, engine or native plugins differ from the store build.",
        ],
      },
      { type: "h", text: "Asset and config updates on Android and iOS" },
      {
        type: "p",
        text: "Replace images and ship remote config without a store release. FireOTAImage shows the updated file, falling back to the bundled asset, and FireOTA.config reads your config.json. On iOS these are the only updates the SDK installs; code push needs a modified Flutter engine, which the package does not include.",
      },
      {
        type: "code",
        code: "fireota flutter assets --platform all --app <appId> \\\n  --assets ./ota-assets --config ./config.json --message \"Holiday theme\"",
      },
      { type: "h", text: "Store policy" },
      {
        type: "p",
        text: "Google Play only allows downloaded code that runs in a virtual machine or interpreter, so Android code push is off by default (allowCodePush: false). Turn it on for enterprise, MDM or sideloaded apps, or after your own policy review. The new Flutter page in the docs explains the details.",
      },
    ],
  },
  {
    slug: "multi-cloud-sovereign-storage",
    date: "2026-10-30",
    title: "Multi-Cloud Sovereign Storage: Cloudflare R2, AWS S3, MinIO, GCS, Azure, and BYOU",
    summary:
      "FireOTA no longer requires Firebase Storage. Connect your own Cloudflare R2 ($0 egress), AWS S3, MinIO, GCS, or Azure bucket with live probe verification, or Bring Your Own URL in CI/CD with 100% code sovereignty.",
    tags: ["Storage", "Cloudflare R2", "AWS S3", "MinIO", "BYOU", "Docs"],
    authors: [SUJAL],
    body: [
      { type: "h", text: "Total code sovereignty: zero proprietary bundle hosting" },
      {
        type: "p",
        text: "Customer application bundles live exclusively inside your own cloud buckets. FireOTA coordinates release metadata, deterministic rollout percentages, version compatibility and telemetry, but never stores your compiled JavaScript on its servers. Mobile devices stream directly from your storage or CDN with local SHA-256 verification.",
      },
      { type: "h", text: "Supported cloud providers" },
      {
        type: "list",
        items: [
          "Cloudflare R2 — zero data egress fees, perfect for high-volume mobile updates.",
          "Amazon S3 — native AWS IAM authentication with CloudFront CDN integration.",
          "MinIO & S3-compatible — self-hosted, air-gapped, on-premise, Wasabi, or DigitalOcean Spaces.",
          "Google Cloud Storage (GCS) — connect directly via Service Account JSON without OAuth consent screens.",
          "Azure Blob Storage — Microsoft Azure enterprise shared key authentication.",
          "Bring Your Own URL (BYOU) — point directly to existing corporate CDNs with no storage credentials required in FireOTA.",
          "Firebase Storage — legacy Google OAuth flow for existing projects.",
        ],
      },
      { type: "h", text: "Automated 4-stage live health probe test" },
      {
        type: "p",
        text: "When connecting a storage target in the dashboard, FireOTA immediately executes a live probe test in under 300ms: establishes an AWS SigV4 handshake, writes fireota/.healthcheck-probe, verifies byte-for-byte stream integrity, and cleans up the temporary file before activating the target.",
      },
      { type: "h", text: "Bring Your Own URL (BYOU) in CI/CD" },
      {
        type: "p",
        text: "Deploying from an automated CI/CD pipeline that already hosts bundles on Akamai, CloudFront or an internal CDN? You can now register and publish updates in milliseconds without providing any storage credentials to FireOTA:",
      },
      {
        type: "code",
        code: 'npx fireota release \\\n  --app <appId> \\\n  --platform android \\\n  --runtime 1.4.0 \\\n  --channel production \\\n  --bundle-url https://cdn.mycompany.com/updates/v1.4.0.fota \\\n  --bundle-hash 9b1e4c...a07d \\\n  --bundle-size 1928374',
      },
      { type: "h", text: "Visual step-by-step guides and diagrams" },
      {
        type: "list",
        items: [
          "Interactive Zero-Proxy architecture diagrams in the docs.",
          "Cloudflare R2 console configuration mockups showing zero egress rate settings.",
          "Live connection wizard walkthroughs with passing probe checkmarks.",
          "Updated documentation under /docs/storage-targets.",
        ],
      },
    ],
  },
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
      { type: "h", text: "A refreshed docs site" },
      {
        type: "list",
        items: [
          "New guide: Expo Updates without EAS, step by step, with screenshots from a real device.",
          "New and Updated tags in the sidebar, on page headers and on new sections.",
          "A cleaner design: page header cards, numbered steps joined by a line, reference tables and a “Was this page helpful?” prompt.",
        ],
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
