/**
 * Server functions for Multi-Cloud Sovereign Storage Targets.
 * Allows clients to manage and test their own storage connections (AWS S3, Cloudflare R2, MinIO, GCS, Azure, BYOU).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orgContextForUser, requirePermission } from "@/lib/backend/context.server";
import {
  createStorageTarget,
  deleteStorageTarget,
  listStorageTargets,
  testStorageTarget,
} from "@/lib/backend/storage/factory.server";
import type { StorageProviderType } from "@/lib/backend/storage/types";

const providerEnum = z.enum(["s3", "r2", "gcs", "minio", "azure", "firebase", "external"]);

export const listStorageTargetsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.read");
    const targets = await listStorageTargets(ctx);

    // Count apps attached to each target
    const { data: apps } = await ctx.db
      .from("apps")
      .select("id, storage_target_id, firebase_project_id")
      .eq("organization_id", ctx.organizationId);

    const counts: Record<string, number> = {};
    for (const app of apps ?? []) {
      const targetId = app.storage_target_id || app.firebase_project_id;
      if (targetId) counts[targetId] = (counts[targetId] ?? 0) + 1;
    }

    return targets.map((t) => ({
      ...t,
      appsCount: counts[t.id] ?? 0,
    }));
  });

const createStorageTargetSchema = z.object({
  name: z.string().min(1).max(100),
  provider: providerEnum,
  bucket: z.string().max(120).optional(),
  endpoint: z.string().max(255).optional(),
  region: z.string().max(50).optional(),
  publicCdnUrl: z.string().max(255).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
});

export const createStorageTargetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof createStorageTargetSchema>) => createStorageTargetSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.connect");
    return createStorageTarget(ctx, {
      name: data.name,
      provider: data.provider as StorageProviderType,
      bucket: data.bucket,
      endpoint: data.endpoint,
      region: data.region,
      publicCdnUrl: data.publicCdnUrl,
      credentials: data.credentials,
    });
  });

const targetIdSchema = z.object({ id: z.string().uuid() });

export const testStorageTargetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof targetIdSchema>) => targetIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.read");
    return testStorageTarget(ctx, data.id);
  });

export const deleteStorageTargetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof targetIdSchema>) => targetIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.disconnect");
    return deleteStorageTarget(ctx, data.id);
  });

