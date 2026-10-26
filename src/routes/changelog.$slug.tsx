import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Authors, Blocks, FollowSubscribe, Tags } from "@/components/site/changelog-ui";
import { SiteHeader } from "@/components/site/site-header";
import { changelog, findEntry, formatDate } from "@/content/changelog";

export const Route = createFileRoute("/changelog/$slug")({
  loader: ({ params }) => {
    const entry = findEntry(params.slug);
    if (!entry) throw notFound();
    return { slug: entry.slug };
  },
  head: ({ params }) => {
    const entry = findEntry(params.slug);
    return {
      meta: entry
        ? [
          { title: `${entry.title} — FireOTA Changelog` },
          { name: "description", content: entry.summary },
          { property: "og:title", content: entry.title },
          { property: "og:description", content: entry.summary },
        ]
        : [{ title: "Changelog — FireOTA" }],
    };
  },
  component: ChangelogEntryPage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="font-display text-[32px] font-bold">Entry not found</h1>
        <Link to="/changelog" className="mt-4 inline-block text-brand hover:underline">
          Back to the changelog
        </Link>
      </main>
    </div>
  ),
});

function ChangelogEntryPage() {
  const { slug } = Route.useLoaderData();
  const index = changelog.findIndex((e) => e.slug === slug);
  const entry = changelog[index]!;
  const newer = changelog[index - 1];
  const older = changelog[index + 1];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 lg:py-16">
        <Link
          to="/changelog"
          className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Changelog
        </Link>
        <time
          dateTime={entry.date}
          className="mt-8 block font-mono text-[13px] uppercase tracking-[0.04em] text-muted-foreground"
        >
          {formatDate(entry.date)}
        </time>
        <h1 className="mt-4 font-display text-[36px] font-bold leading-tight tracking-tight sm:text-[48px]">
          {entry.title}
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Authors authors={entry.authors} />
          <Tags tags={entry.tags} />
        </div>
        <p className="mt-8 text-[19px] leading-relaxed text-muted-foreground">{entry.summary}</p>
        <div className="mt-8">
          <Blocks blocks={entry.body} />
        </div>

        <nav className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {older ? (
            <Link
              to="/changelog/$slug"
              params={{ slug: older.slug }}
              className="rounded-2xl border border-border p-4 hover:border-brand/50"
            >
              <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <ArrowLeft className="size-3.5" /> Older
              </span>
              <span className="mt-1 block text-[15px] font-semibold">{older.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link
              to="/changelog/$slug"
              params={{ slug: newer.slug }}
              className="rounded-2xl border border-border p-4 text-right hover:border-brand/50"
            >
              <span className="flex items-center justify-end gap-1 text-[12px] text-muted-foreground">
                Newer <ArrowRight className="size-3.5" />
              </span>
              <span className="mt-1 block text-[15px] font-semibold">{newer.title}</span>
            </Link>
          ) : null}
        </nav>
        <div className="mt-10">
          <FollowSubscribe />
        </div>
      </main>
    </div>
  );
}
