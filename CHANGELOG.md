# Changelog

All notable changes to the FireOTA project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.0] - 2026-10-30

### Added
- **Multi-Cloud Sovereign Storage Targets**:
  - Full support for **Cloudflare R2**, **Amazon S3**, **MinIO**, **Wasabi**, **DigitalOcean Spaces**, **Google Cloud Storage** (via Service Account JSON), and **Azure Blob Storage**.
  - **Zero-Proxy & Total Code Sovereignty**: FireOTA coordinates metadata, rollout percentages, and audit logs, but never stores compiled customer JavaScript bundles on FireOTA servers. Mobile devices stream `.fota` update archives directly from client-owned storage or CDNs.
  - Pure AWS SigV4 signer and URL presigner implementation (`src/lib/backend/storage/sigv4.ts`) with zero external AWS SDK runtime dependencies.
  - Automated 4-stage health check probe (`factory.server.ts`): validates endpoint reachability, tests write permissions (`fireota/.healthcheck-probe`), verifies byte-for-byte stream integrity, and cleans up the test object in under 300ms before activating a target.
  - Credential security: all storage target keys, tokens, and service account JSON secrets are encrypted at rest using AES-256-GCM (`FIREOTA_ENCRYPTION_KEY`).
- **Bring Your Own URL (BYOU)**:
  - Enterprise CI/CD pipeline integration allowing teams to host update bundles on their own corporate CDNs (CloudFront, Akamai, Fastly, etc.) and register releases with FireOTA using `{ url, sha256, size }` without providing cloud credentials.
  - Full CLI support via `fireota release --bundle-url <url> --bundle-hash <sha256> --bundle-size <bytes>`.
- **Database Schema**:
  - Migration `supabase/migrations/20261031120000_multi_cloud_storage_targets.sql`: creates `storage_targets` table, `storage_provider_type` enum, adds `apps.storage_target_id` and `releases.external_bundle_url`.
  - Automatic zero-downtime migration of existing `firebase_projects` into `storage_targets`.
- **Web Console UI**:
  - Multi-cloud Connect Storage wizard (`/projects/connect`) with provider presets (Cloudflare R2, AWS S3, MinIO, GCS, Azure, BYOU) and live verification probe tests.
  - Storage Targets management dashboard (`/projects`) listing active targets, custom CDNs, and connected apps.
  - App creation workflow (`/apps/new`) updated with storage target selector.
- **Documentation & Visual Guides**:
  - Comprehensive guide in `/docs/storage-targets` with provider matrix and step-by-step connection instructions.
  - Visual interactive documentation mockups and architecture diagrams (`src/components/docs/figures.tsx`):
    - `StorageArchitectureDiagram`: Zero-proxy direct download architecture diagram.
    - `CloudflareR2SetupMock`: Cloudflare R2 bucket dashboard with zero data egress rate.
    - `ConnectStorageMock`: Step-by-step multi-cloud storage connection wizard with live probe verification.
    - `StorageTargetsListMock`: Storage targets management dashboard.
    - `ByouFlowDiagram`: 4-step Bring-Your-Own-URL (BYOU) enterprise workflow diagram.

---

## [0.4.0] - 2026-10-26

### Added
- **Expo Config Plugin (`@fireota/react-native/app.plugin.js`)**:
  - Automatic native project patching for Expo Continuous Native Generation (CNG) during `expo prebuild`.
  - Configures `MainApplication` (`getJSBundleFile` / `jsBundleFilePath`) on Android and `AppDelegate` (`bundleURL`) on iOS for both Kotlin/Java and Swift/Obj-C templates.
  - First-class support for Expo SDK 50+ and EAS Build pipelines.
- **Expo-aware CLI (`@fireota/cli`)**:
  - `fireota init` detects `app.json` / `app.config.*`, configures the plugin, and reads `runtimeVersion` from the Expo configuration.
  - Automatic detection and bundling using `npx expo export:embed`.
- **Expo Documentation**:
  - Dedicated `/docs/expo` guide for EAS Build, development clients, and migrating from `expo-updates`.

---

## [0.3.0] - 2026-10-20

### Added
- **Cryptographic Code Signing**:
  - Asymmetric Ed25519 signature generation on publish with strict on-device signature verification before applying updates.
- **Automatic Rollback Sentinel**:
  - Device-level crash detection: if an updated JavaScript bundle crashes before `FireOTA.configure()` executes, the app reverts to the previous stable bundle on the next launch and reports an `install_failed` event.
- **HMAC-Signed Webhooks**:
  - Webhook delivery engine with HMAC-SHA256 signatures, exponential backoff retries, and dead-letter queue tracking for release lifecycle events.
- **Role-Based Access Control (RBAC)**:
  - Multi-tenant organization support with Owner, Admin, Release Manager, Developer, and Viewer roles enforced via Supabase Row Level Security.

---

## [0.2.0] - 2026-10-10

### Added
- **Deterministic Staged Rollouts**:
  - Hash-based per-device rollout distribution (0–100%) mapped consistently to persistent device installation IDs.
- **Multi-Channel Management**:
  - Independent channel support (`production`, `beta`, `staging`, `development`) with separate rollout percentages and targeting policies.
- **Analytics & Crash Telemetry**:
  - Ingestion endpoints (`/updates/events`) tracking check rates, download latency, installation success, and rollback metrics.

---

## [0.1.0] - 2026-10-01

### Added
- Initial release of FireOTA over-the-air update server.
- Core React Native SDK (`@fireota/react-native`) for Android and iOS.
- Command-line interface (`@fireota/cli`) for bundle packaging and release publishing.
- Google Firebase Storage integration with OAuth authentication.

