/** GET /sitemap.xml — every public, indexable page (landing, docs, legal, auth entry points). */
import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { allPages } from "@/components/docs/pages";

const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/docs", priority: "0.9", changefreq: "weekly" },
  { path: "/signup", priority: "0.6", changefreq: "monthly" },
  { path: "/login", priority: "0.4", changefreq: "monthly" },
  { path: "/privacy", priority: "0.2", changefreq: "yearly" },
  { path: "/terms", priority: "0.2", changefreq: "yearly" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const base = process.env["FIREOTA_PUBLIC_URL"] ?? new URL(getRequest().url).origin;
        const entries = [
          ...STATIC_PAGES,
          ...allPages.map((p) => ({ path: `/docs/${p.slug}`, priority: "0.7", changefreq: "monthly" })),
        ];
        const urls = entries
          .map((e) => `  <url><loc>${base}${e.path}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`)
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
