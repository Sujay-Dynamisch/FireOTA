/**
 * End-to-End Release Flow with Multi-Cloud Sovereign Storage Targets.
 * Exercises:
 *   - Sovereign Storage Target creation (R2 / S3 / BYOU)
 *   - App creation attached to custom Storage Target
 *   - Direct BYOU Release creation with externalBundle
 *   - Update check resolving the exact customer storage download URL
 *   - Rollout and safety assertions
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { orgContextForUser, type OrgContext } from "@/lib/backend/context.server";
import { encryptSecret } from "@/lib/backend/crypto.server";
import { updateCheck } from "@/lib/backend/ota.server";
import { createRelease, publishRelease } from "@/lib/backend/releases.server";

const url = process.env["SUPABASE_URL"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const configured = Boolean(url && serviceKey && anonKey && process.env["FIREOTA_ENCRYPTION_KEY"]);

const run = `st${Date.now().toString(36)}`;
const password = `Fx!${crypto.randomUUID()}`;
const db: SupabaseClient = configured ? createClient(url, serviceKey, { auth: { persistSession: false } }) : (null as never);

describe.skipIf(!configured)("Multi-Cloud Sovereign Storage End-to-End Release Flow", () => {
  let userId: string;
  let orgId: string;
  let targetId: string;
  let appId: string;
  let channelId: string;
  let ctx: OrgContext;

  beforeAll(async () => {
    // 1. Create test user
    const { data: user, error: userErr } = await db.auth.admin.createUser({
      email: `${run}-user@fireota.test`,
      password,
      email_confirm: true,
      user_metadata: { name: "Storage Test User" },
    });
    if (userErr) throw userErr;
    userId = user.user.id;

    // 2. Create organization
    const { data: org, error: orgErr } = await db
      .from("organizations")
      .insert({ name: `Org ${run}`, slug: `org-${run}`, created_by: userId })
      .select("id")
      .single();
    if (orgErr) throw orgErr;
    orgId = org.id;

    await db.from("organization_members").insert({
      organization_id: orgId,
      user_id: userId,
      email: `${run}-user@fireota.test`,
      name: "Owner",
      role: "owner",
      status: "active",
    });

    ctx = await orgContextForUser(userId, orgId);

    // 3. Create Cloudflare R2 / S3 Storage Target
    const credsCiphertext = encryptSecret(
      JSON.stringify({
        accessKeyId: "r2-test-key",
        secretAccessKey: "r2-test-secret",
      }),
    );

    const { data: target, error: targetErr } = await db
      .from("storage_targets")
      .insert({
        organization_id: orgId,
        name: "Test Cloudflare R2 Target",
        provider: "r2",
        bucket: "my-releases-bucket",
        endpoint: "https://abc123456789.r2.cloudflarestorage.com",
        region: "auto",
        public_cdn_url: "https://cdn.mycustomerdomain.com",
        config_ciphertext: credsCiphertext,
        status: "connected",
      })
      .select("id")
      .single();
    if (targetErr) throw targetErr;
    targetId = target.id;

    // 4. Create App attached to the Storage Target (NO Firebase)
    const { data: appRow, error: appErr } = await db
      .from("apps")
      .insert({
        organization_id: orgId,
        name: "Sovereign App",
        slug: `app-${run}`,
        runtime_version: "2.0.0",
        storage_target_id: targetId,
        firebase_project_id: null,
        status: "active",
      })
      .select("id")
      .single();
    if (appErr) throw appErr;
    appId = appRow.id;

    await db.from("app_platforms").insert([
      { organization_id: orgId, app_id: appId, platform: "android", package_name: "com.sovereign.app", native_version: "2.0.1", runtime_version: "2.0.0" },
      { organization_id: orgId, app_id: appId, platform: "ios", bundle_identifier: "com.sovereign.app", native_version: "2.0.1", runtime_version: "2.0.0" },
    ]);

    const { data: chan, error: chanErr } = await db
      .from("channels")
      .insert({
        organization_id: orgId,
        app_id: appId,
        name: "production",
        environment: "production",
        status: "empty",
      })
      .select("id")
      .single();
    if (chanErr) throw chanErr;
    channelId = chan.id;
  });

  afterAll(async () => {
    if (!configured) return;
    await db.from("releases").delete().eq("organization_id", orgId);
    await db.from("channels").delete().eq("organization_id", orgId);
    await db.from("app_platforms").delete().eq("organization_id", orgId);
    await db.from("apps").delete().eq("organization_id", orgId);
    await db.from("storage_targets").delete().eq("organization_id", orgId);
    await db.from("organization_members").delete().eq("organization_id", orgId);
    await db.from("organizations").delete().eq("id", orgId);
    await db.auth.admin.deleteUser(userId);
  });

  it("creates a Bring-Your-Own-URL release directly in ready state", async () => {
    const externalBundleUrl = "https://cdn.mycustomerdomain.com/updates/v2.0.1-bundle.fota";
    const externalHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const release = await createRelease(ctx, {
      appId,
      channelName: "production",
      platform: "android",
      version: "2.0.1",
      runtimeVersion: "2.0.0",
      releaseNotes: "Sovereign OTA release without proprietary storage",
      externalBundle: {
        url: externalBundleUrl,
        sha256: externalHash,
        size: 512000,
      },
    });

    expect(release.status).toBe("ready");
    expect(release.bundle_hash).toBe(externalHash);
    expect(release.bundle_size).toBe(512000);
    expect((release as unknown as { external_bundle_url: string }).external_bundle_url).toBe(externalBundleUrl);
  });

  it("publishes the sovereign release and device updateCheck receives the custom CDN bundle URL", async () => {
    const externalBundleUrl = "https://cdn.mycustomerdomain.com/updates/v2.0.1-bundle.fota";
    const externalHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    // 1. Fetch release
    const { data: releaseRow } = await db
      .from("releases")
      .select("id")
      .eq("organization_id", orgId)
      .eq("app_id", appId)
      .single();

    // 2. Publish release to 100%
    const publishRes = await publishRelease(ctx, {
      releaseId: releaseRow!.id,
      rolloutPercentage: 100,
    });
    expect(publishRes.status).toBe("published");
    expect(publishRes.rollout).toBe(100);

    // 3. Device checks for update via updateCheck endpoint
    const result = await updateCheck(db, {
      appKey: appId,
      channelName: "production",
      platform: "android",
      installationId: `${run}-device-device1`,
      runtimeVersion: "2.0.0",
      nativeVersion: "2.0.1",
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.release).toBeDefined();
    expect(result.release?.bundle.url).toBe(externalBundleUrl);
    expect(result.release?.bundle.hash).toBe(externalHash);
    expect(result.release?.bundle.size).toBe(512000);
  });

  it("resolves presigned S3/R2 URLs when stored with storage_target_id", async () => {
    // Insert a release stored with relative path in R2 bucket
    const { data: r2Release } = await db
      .from("releases")
      .insert({
        organization_id: orgId,
        app_id: appId,
        channel_id: channelId,
        number: 999,
        platform: "ios",
        version: "2.0.2",
        runtime_version: "2.0.0",
        native_version_constraint: "*",
        status: "ready",
        bundle_hash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        bundle_size: 1024000,
        storage_path: "fireota/apps/test/ios/r2/bundle.hbc",
        created_by_label: "test",
      })
      .select("id")
      .single();

    await publishRelease(ctx, {
      releaseId: r2Release!.id,
      rolloutPercentage: 100,
    });

    const result = await updateCheck(db, {
      appKey: appId,
      channelName: "production",
      platform: "ios",
      installationId: `${run}-device-ios1`,
      runtimeVersion: "2.0.0",
      nativeVersion: "2.0.1",
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.release?.bundle.url).toBe("https://cdn.mycustomerdomain.com/fireota/apps/test/ios/r2/bundle.hbc");
  });
});

