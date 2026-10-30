# FireOTA roadmap: compatibility and integration backlog

Status on 2026-10-26. Planning only — nothing below is implemented yet. Tick items off as they ship.

## Where we stand today

| Question | Today | Gap |
|---|---|---|
| **Expo support** | Bare React Native only. Docs say: run `npx expo prebuild`, then edit `MainApplication` / `AppDelegate` by hand. Expo Go is not supported; `expo-updates` must not be installed. | No Expo config plugin, so every `expo prebuild` / EAS Build regenerates the native folders and **wipes the FireOTA changes**. Unusable for managed (CNG) Expo apps. |
| **Using FireOTA with an existing system** | REST API with scoped API keys (`/api/public/v1/releases` list/create, upload bundle, publish; `updates/check`, `updates/events`), signed webhooks, CLI for CI, self-hosting guide, code signing. | API can't pause, roll back, change rollout % or manage channels/apps. No OpenAPI spec, no SSO, no CodePush/App Center migration, SDK can't send custom headers or forward events to an existing analytics/monitoring stack. |
| **Own storage instead of Firebase Storage** | Not supported. Storage is hard-wired to Firebase (`src/lib/backend/firebase.server.ts`: `uploadArtifact`, `verifyArtifact`, `deleteArtifact`, `artifactDownloadUrl`; `firebaseTargetForApp` in `releases.server.ts`). | The SDK is already storage-agnostic (it downloads `bundle.url` and checks the SHA-256), so the work is only on the server: a storage-provider layer plus S3-compatible and "bring your own URL" options. |

## Backlog

Priority: **P0** blocks adoption, **P1** expected by most teams, **P2** nice to have. Effort is in focused dev-days.

### Expo

- [x] **1. Expo config plugin (P0, 2–3 d)** — done 2026-10-26: `app.plugin.js` + `plugin/`, tested on Expo SDK 58 (prebuild, Android release compile)
  - Add `app.plugin.js` to `@fireota/react-native` that patches `MainApplication` (`getJSBundleFile` / `jsBundleFilePath`) and `AppDelegate` (`bundleURL`) during `expo prebuild`, for both Kotlin/Java and Swift/Obj-C templates.
  - Usage: `"plugins": ["@fireota/react-native"]` in `app.json`; works with EAS Build.
  - Files: `packages/react-native/app.plugin.js` (new), `package.json` (`files`, `expo` peer as optional), docs `install-sdk` + `android-setup` / `ios-setup`.
  - Done when: a fresh `npx create-expo-app` + plugin + `eas build` receives an OTA update with no manual native edits.
- [x] **2. Expo-aware setup (P1, 1–2 d)** — done 2026-10-26: `init` (app.json plugin, expo-router layout / registerRootComponent, expo-updates warning) and Expo bundling via `expo export:embed`
  - `fireota init` detects Expo (`app.json` / `app.config.*`), adds the plugin instead of editing native files, reads `runtimeVersion` from the Expo config, and warns or stops if `expo-updates` is installed.
  - Files: `packages/cli/lib/init.mjs`, `packages/cli/lib/project.mjs`.
- [ ] **3. Expo docs and example app (P1, 1 d)** — docs done (`/docs/expo`, SDK README); example app and an on-device OTA run still to do
  - Replace the "Expo projects" note in docs with a full Expo guide (plugin, EAS Build, dev client vs release, migrating off `expo-updates`); add an `examples/expo` app used for the device test.

### Your own storage

- [x] **4. Storage-provider layer (P0, 2 d)** — done 2026-10-30: unified StorageProvider layer
  - Interface `StorageProvider { upload, verify, delete, downloadUrl }`; move the Firebase code behind it as `FirebaseStorageProvider`. Store the provider per project (new `storage_providers` table or `provider` + encrypted `config` on `firebase_projects`, renamed to "storage targets" in the UI).
  - Files: `src/lib/backend/storage/*.server.ts` (new), `releases.server.ts`, `ota.server.ts`, migration.
  - Done when: all current tests pass with Firebase going through the new layer.
- [x] **5. S3-compatible storage: AWS S3, Cloudflare R2, MinIO, Wasabi, DigitalOcean Spaces (P0, 2–3 d)** — done 2026-10-30: SigV4 presigning and live verification probes
  - Endpoint, bucket, region, access key (encrypted with `FIREOTA_ENCRYPTION_KEY`, like refresh tokens). Uploads and downloads via short-lived presigned URLs; optional public CDN base URL. "Verify" writes, reads and deletes a probe file, like the Firebase check.
  - Dashboard: a "Connect storage" choice next to "Connect Firebase" in onboarding and Projects.
- [x] **6. Bring-your-own-URL bundles (P1, 1 d)** — done 2026-10-30: externalBundle API & CLI --bundle-url
  - Teams that already host files on their own CDN upload there in CI, then register the release with `{ url, sha256, size }`. FireOTA never touches the file; the SDK's hash check keeps it safe.
  - Files: `api.public.v1.releases.ts` (accept `externalBundle`), CLI `publish --bundle-url`, docs.
- [x] **7. More providers: Google Cloud Storage with a service account, Azure Blob (P2, 1 d each)** — done 2026-10-30: GCS service account JSON & Azure Blob
  - GCS via service-account JSON also removes the Google OAuth consent step for teams on Google Cloud (see the OAuth verification problems we just hit).

### Integrating with existing systems

- [ ] **8. Complete the public REST API + OpenAPI spec (P1, 2–3 d)**
  - Add endpoints for rollout %, pause/resume, rollback, promote, channels and apps (the dashboard already has these as server functions in `releases.server.ts` / `channels.server.ts`). Publish `/api/public/v1/openapi.json` and render it on the API reference docs page.
- [ ] **9. Migration from CodePush / App Center (P1, 2 d)**
  - App Center is retired, so CodePush users are the biggest audience. Docs mapping (deployment keys → channels, `codePush.sync` → FireOTA SDK), a `fireota migrate codepush` helper that creates matching channels, and a compatibility checklist.
- [ ] **10. SDK hooks for existing stacks (P1, 1–2 d)**
  - `configure({ headers, onEvent, logger })`: custom headers for gateways/proxies, and an event callback (check, download, install, rollback) to forward to Sentry, Datadog, Firebase Analytics or Mixpanel. Optional `attributes` (user id, country) for targeted rollouts later.
  - Needs a new SDK release (**minor version**).
- [ ] **11. CI templates (P1, 1 d)**
  - Official GitHub Action (`fireota/publish-action`), plus copy-paste configs for GitLab CI, Bitrise, Codemagic and Azure DevOps on the CI docs page.
- [ ] **12. Chat-ops integrations (P2, 1–2 d)**
  - Native Slack, Microsoft Teams and Discord notifications (built on the existing signed webhooks), with Pause/Rollback buttons that call the API.
- [ ] **13. Single sign-on (P2, 2 d)**
  - SAML / OIDC (Okta, Azure AD, Google Workspace) through Supabase Auth SSO, plus "auto-join organization by email domain".
- [ ] **14. Audit log export / streaming (P2, 1 d)**
  - CSV/JSON export and a webhook or S3 sink for audit events, for teams with a SIEM.

### Reliability (blocks everything above going to production)

- [ ] **15. Device-test iOS (P0, 1–2 d)**
  - The docs still say iOS is "implemented but not yet device-tested". Run the full flow (check, download, install, mandatory, rollback) on a real iPhone release build and fix what breaks.
- [ ] **16. Production checklist (P0, 0.5 d)**
  - Apply pending migrations (`20261016120000_admin_signing_agents_security.sql`, `20261025120000_agent_conversations.sql`) with `npx supabase db push`; on Vercel set `FIREOTA_PUBLIC_URL`, and keep `GOOGLE_*` values free of stray spaces; merge the feature branches into `main`.

## Suggested order

| Day | Work |
|---|---|
| 1 | 16 production checklist, start 15 iOS device test |
| 2–4 | 1 Expo config plugin, 2 Expo-aware `fireota init` |
| 5 | 3 Expo docs + example app |
| 6–7 | 4 storage-provider layer |
| 8–10 | 5 S3-compatible storage, 6 bring-your-own-URL |
| 11–13 | 8 public API + OpenAPI, 10 SDK hooks (ship SDK minor release) |
| 14–15 | 9 CodePush migration, 11 CI templates |
| Later | 7, 12, 13, 14 |
