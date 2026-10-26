/** GET /changelog.xml — RSS 2.0 feed of the changelog for feed readers and Slack. */
import { createFileRoute } from "@tanstack/react-router";

import { changelog, type ChangelogBlock } from "@/content/changelog";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function html(blocks: ChangelogBlock[]) {
  return blocks
    .map((b) => {
      if (b.type === "h") return `<h3>${escape(b.text)}</h3>`;
      if (b.type === "list")
        return `<ul>${b.items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>`;
      if (b.type === "code") return `<pre><code>${escape(b.code)}</code></pre>`;
      return `<p>${escape(b.text)}</p>`;
    })
    .join("");
}

export const Route = createFileRoute("/changelog.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin;
        const items = changelog
          .map((entry) => {
            const link = `${origin}/changelog/${entry.slug}`;
            return `    <item>
      <title>${escape(entry.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(entry.summary)}</description>
      <content:encoded><![CDATA[${html(entry.body)}]]></content:encoded>
${entry.tags.map((t) => `      <category>${escape(t)}</category>`).join("\n")}
    </item>`;
          })
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>FireOTA Changelog</title>
    <link>${origin}/changelog</link>
    <atom:link href="${origin}/changelog.xml" rel="self" type="application/rss+xml" />
    <description>New features, fixes and releases of FireOTA.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
        return new Response(xml, {
          headers: {
            "content-type": "application/rss+xml; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
