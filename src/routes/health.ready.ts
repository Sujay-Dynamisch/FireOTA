/** GET /health/ready — configuration is complete and the database answers. */
import { createFileRoute } from "@tanstack/react-router";

import { readiness } from "@/lib/backend/health.server";

export const Route = createFileRoute("/health/ready")({
  server: {
    handlers: {
      GET: async () => {
        const report = await readiness();
        return Response.json(report, { status: report.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
