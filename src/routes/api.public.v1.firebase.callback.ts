/**
 * Google OAuth redirect target for connecting a customer Firebase account.
 * Exchanges the one-time code, stores the encrypted refresh token, and returns
 * the operator to the connect wizard.
 */
import { createFileRoute } from "@tanstack/react-router";

import { admin } from "@/lib/backend/context.server";
import { exchangeCode, GOOGLE_SCOPES } from "@/lib/backend/firebase.server";

function back(origin: string, params: Record<string, string>) {
  const url = new URL("/projects/connect", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString(), 302);
}

export const Route = createFileRoute("/api/public/v1/firebase/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const denied = url.searchParams.get("error");
        if (denied) return back(origin, { status: "denied" });
        if (!code || !state) return back(origin, { status: "invalid" });

        const db = await admin();
        const { data: pending } = await db
          .from("oauth_states")
          .select("state, organization_id, user_id, code_verifier, created_at")
          .eq("state", state)
          .maybeSingle();
        // One-time use, ten minute lifetime.
        await db.from("oauth_states").delete().eq("state", state);
        if (!pending) return back(origin, { status: "expired" });
        if (Date.now() - new Date(pending.created_at as string).getTime() > 10 * 60_000) {
          return back(origin, { status: "expired" });
        }

        try {
          const tokens = await exchangeCode({
            code,
            verifier: pending.code_verifier as string,
            origin,
          });

          await db.from("firebase_connections").insert({
            organization_id: pending.organization_id,
            google_account: tokens.email,
            refresh_token_ciphertext: tokens.refreshTokenCiphertext,
            scopes: GOOGLE_SCOPES,
            status: "connected",
            created_by: pending.user_id,
          });

          await db.from("audit_logs").insert({
            organization_id: pending.organization_id,
            actor_id: pending.user_id,
            actor_label: tokens.email || "google",
            action: "firebase.authorized",
            resource_type: "firebase_connection",
            app_name: "",
            result: "success",
          });

          return back(origin, { status: "connected" });
        } catch (error) {
          console.error(JSON.stringify({ level: "error", firebaseCallback: String(error) }));
          return back(origin, { status: "failed" });
        }
      },
    },
  },
});
