/**
 * Bundle upload for CI pipelines: multipart/form-data with a `bundle` file and
 * optional `assets` files. The checksum is computed server-side and compared
 * against an optional `x-bundle-sha256` header.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { contextFromRequest, rateLimit } from "@/lib/backend/apikeys.server";
import { ApiError, jsonError, jsonOk } from "@/lib/backend/errors";
import { uploadReleaseBundle } from "@/lib/backend/releases.server";

/**
 * Uploads are buffered to hash them, and edge workers have ~128 MB of memory, so the
 * whole request (bundle + assets) is capped well below that. Hermes bundles with
 * assets are typically 5–20 MB.
 */
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const expoFields = z.object({
  assets: z.array(z.object({ name: z.string().min(1).max(200), ext: z.string().max(16) })).max(2000),
  config: z.record(z.string(), z.unknown()).nullable(),
});

/** `format=expo` uploads carry `expoAssets` (name + extension per file) and the public `expoConfig`. */
function parseExpoFields(form: FormData) {
  const read = (key: string) => {
    const value = form.get(key);
    if (typeof value !== "string" || !value) return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new ApiError("INVALID_INPUT", `\`${key}\` must be JSON.`);
    }
  };
  const parsed = expoFields.safeParse({ assets: read("expoAssets") ?? [], config: read("expoConfig") });
  if (!parsed.success) throw new ApiError("INVALID_INPUT", "The Expo asset list or app config is malformed.");
  return parsed.data;
}

export const Route = createFileRoute("/api/public/v1/releases/$releaseId/bundle")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromRequest(request, "release.write");
          await rateLimit(ctx.db, `upload:${ctx.organizationId}`, 60, 60);
          const declared = Number(request.headers.get("content-length") ?? 0);
          if (declared > MAX_UPLOAD_BYTES) throw new ApiError("UPLOAD_FAILED", "The upload exceeds the 40 MB limit.");

          const form = await request.formData();
          const bundle = form.get("bundle");
          if (!(bundle instanceof File)) throw new ApiError("INVALID_INPUT", "A `bundle` file is required.");
          let total = bundle.size;
          if (total > MAX_UPLOAD_BYTES) throw new ApiError("UPLOAD_FAILED", "The bundle exceeds the 40 MB limit.");

          const assets: { name: string; bytes: Uint8Array; contentType: string }[] = [];
          for (const entry of form.getAll("assets")) {
            if (entry instanceof File) {
              total += entry.size;
              if (total > MAX_UPLOAD_BYTES) throw new ApiError("UPLOAD_FAILED", "The upload exceeds the 40 MB limit.");
              assets.push({
                name: entry.name,
                bytes: new Uint8Array(await entry.arrayBuffer()),
                contentType: entry.type || "application/octet-stream",
              });
            }
          }

          const expo = form.get("format") === "expo" ? parseExpoFields(form) : undefined;
          const expectedHash = request.headers.get("x-bundle-sha256");
          const signatureField = form.get("signature");
          const signature =
            request.headers.get("x-fireota-signature") ?? (typeof signatureField === "string" ? signatureField : null);
          const result = await uploadReleaseBundle(ctx, {
            releaseId: params.releaseId,
            bundle: {
              bytes: new Uint8Array(await bundle.arrayBuffer()),
              contentType: bundle.type || "application/octet-stream",
              ...(expectedHash ? { expectedHash } : {}),
            },
            assets,
            ...(signature ? { signature: signature.trim() } : {}),
            ...(expo ? { expo } : {}),
          });

          return jsonOk(result, { headers: { "x-request-id": requestId } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
