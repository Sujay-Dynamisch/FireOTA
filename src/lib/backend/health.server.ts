/** Readiness: required configuration is present and Postgres answers. Reports names, never values. */
import { admin } from "./context.server";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIREOTA_ENCRYPTION_KEY"];
const FIREBASE_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

export async function readiness() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  const firebaseOAuth = FIREBASE_ENV.every((name) => Boolean(process.env[name]));

  let database = false;
  if (missing.length === 0) {
    try {
      const db = await admin();
      const { error } = await db.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
      database = !error;
    } catch {
      database = false;
    }
  }

  return {
    status: missing.length === 0 && database ? ("ok" as const) : ("unavailable" as const),
    checks: { config: missing.length === 0 ? "ok" : `missing ${missing.join(", ")}`, database: database ? "ok" : "unreachable", firebaseOAuth: firebaseOAuth ? "configured" : "not configured" },
    time: new Date().toISOString(),
  };
}
