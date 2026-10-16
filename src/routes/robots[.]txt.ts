/** GET /robots.txt — public marketing/docs pages are crawlable; the signed-in app and API are not. */
import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

const PRIVATE_PATHS = [
  "/api/",
  "/health",
  "/dashboard",
  "/apps",
  "/releases",
  "/channels",
  "/rollouts",
  "/analytics",
  "/projects",
  "/team",
  "/audit-logs",
  "/security",
  "/settings",
  "/agents",
  "/onboarding",
  "/verify-email",
  "/reset-password",
];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const base = process.env["FIREOTA_PUBLIC_URL"] ?? new URL(getRequest().url).origin;
        const body = ["User-agent: *", "Allow: /", ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`), "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
        return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
