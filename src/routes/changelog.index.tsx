import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Authors, FollowSubscribe, SearchBox, Tags } from "@/components/site/changelog-ui";
import { SiteHeader } from "@/components/site/site-header";
import { changelog, formatDate } from "@/content/changelog";

export const Route = createFileRoute("/changelog/")({
  head: () => ({
    meta: [
      { title: "Changelog — FireOTA" },
      {
        name: "description",
        content: "New features, fixes and releases of FireOTA, the React Native SDK and the CLI.",
      },
      { property: "og:title", content: "FireOTA Changelog" },
      { property: "og:description", content: "Everything new in FireOTA." },
    ],
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: "FireOTA Changelog",
        href: "/changelog.xml",
      },
    ],
  }),
  component: ChangelogPage,
});

function ChangelogPage() {
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return changelog;
    return changelog.filter((entry) =>
      [
        entry.title,
        entry.summary,
        entry.tags.join(" "),
        ...entry.body.map((b) =>
          "text" in b ? b.text : "items" in b ? b.items.join(" ") : b.code,
        ),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-16 lg:py-20">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <h1 className="font-display text-[48px] font-bold leading-none tracking-tight sm:text-[60px]">
            Changelog
          </h1>
          <div className="mt-8 max-w-[300px] space-y-3">
            <SearchBox value={query} onChange={setQuery} />
            <FollowSubscribe />
          </div>
        </aside>

        <ol className="relative border-l border-border pl-8 sm:pl-14">
          {entries.length === 0 ? (
            <li className="py-10 text-[15px] text-muted-foreground">No entries match “{query}”.</li>
          ) : null}
          {entries.map((entry) => (
            <li key={entry.slug} className="relative pb-20 last:pb-4">
              <span
                aria-hidden
                className="absolute -left-[calc(2rem+3.5px)] top-1.5 size-[7px] rounded-full bg-brand sm:-left-[calc(3.5rem+3.5px)]"
              />
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[13px] uppercase tracking-[0.04em]">
                <time dateTime={entry.date} className="text-muted-foreground">
                  {formatDate(entry.date)}
                </time>
                <Link
                  to="/changelog/$slug"
                  params={{ slug: entry.slug }}
                  className="text-brand hover:underline"
                >
                  / Read more →
                </Link>
              </p>
              <h2 className="mt-5 font-display text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
                <Link
                  to="/changelog/$slug"
                  params={{ slug: entry.slug }}
                  className="hover:text-brand"
                >
                  {entry.title}
                </Link>
              </h2>
              <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-muted-foreground">
                {entry.summary}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Authors authors={entry.authors} />
                <Tags tags={entry.tags} />
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
