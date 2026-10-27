import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MIcon, NewBadge } from "@/components/docs/docs-ui";
import { findPage } from "@/components/docs/pages";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    const found = findPage(params.slug);
    if (!found) throw notFound();
    return { title: found.page.title, description: found.page.description };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
        { title: `${loaderData.title} — FireOTA Docs` },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: `${loaderData.title} — FireOTA Docs` },
        { property: "og:description", content: loaderData.description },
      ]
      : [],
  }),
  component: DocPageView,
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-[28px] font-bold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        That documentation page does not exist.{" "}
        <Link to="/docs" className="text-brand hover:underline">
          Back to the docs home
        </Link>
      </p>
    </main>
  ),
});

/** Highlights the section currently in view, like the Firebase docs' right-hand rail. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    setActive(ids[0] ?? "");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

const EDIT_URL = "https://github.com/Sujay-Dynamisch/FireOTA/blob/main/src/components/docs/pages.tsx";

function PageFeedback() {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  return (
    <div className="mt-14 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-5 py-4">
      {answer ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <MIcon name="favorite" filled className="text-[18px] text-brand" />
          {answer === "yes" ? "Thanks for the feedback!" : "Thanks. Tell us what was missing on GitHub so we can fix it."}
        </p>
      ) : (
        <>
          <p className="text-[13px] font-medium">Was this page helpful?</p>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAnswer(value)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1 text-[12px] hover:border-brand/50 hover:text-brand"
              >
                <MIcon name={value === "yes" ? "thumb_up" : "thumb_down"} className="text-[16px]" />
                {value === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DocPageView() {
  const { slug } = Route.useParams();
  const found = findPage(slug);
  const sectionIds = found?.page.sections.map((s) => s.id) ?? [];
  const active = useActiveSection(sectionIds);
  if (!found) return null;
  const { page, prev, next } = found;

  return (
    <div className="flex">
      <article className="min-w-0 flex-1 px-5 py-8 sm:px-10 lg:py-10">
        <div className="mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground">
            <Link to="/docs" className="hover:text-brand">
              Documentation
            </Link>
            <MIcon name="chevron_right" className="text-[16px] text-faint" />
            <span>{page.group.title}</span>
            <MIcon name="chevron_right" className="text-[16px] text-faint" />
            <span className="text-foreground">{page.title}</span>
          </nav>

          <header className="relative mt-5 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/[0.08] via-surface/40 to-transparent px-6 py-7 sm:px-8">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <MIcon name={page.group.icon} className="text-[14px] text-brand" />
                {page.group.title}
              </span>
              {page.badge ? <NewBadge label={page.badge === "new" ? "New" : "Updated"} /> : null}
            </div>
            <h1 className="relative mt-3 font-display text-[30px] font-bold leading-[1.15] tracking-tight sm:text-[40px]">{page.title}</h1>
            <p className="relative mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">{page.description}</p>
            <p className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-faint">
              <span className="inline-flex items-center gap-1">
                <MIcon name="toc" className="text-[15px]" /> {page.sections.length} sections
              </span>
              <a href={EDIT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand">
                <MIcon name="edit" className="text-[15px]" /> Edit this page on GitHub
              </a>
            </p>
          </header>

          <div className="mt-10 space-y-12">
            {page.sections.map((section, i) => (
              <section key={section.id} id={section.id} className={cn("scroll-mt-20", i > 0 && "border-t border-border/70 pt-10")}>
                <h2 className="group flex flex-wrap items-center gap-2 font-display text-[23px] font-semibold tracking-tight">
                  {section.title}
                  {section.isNew ? <NewBadge /> : null}
                  <a
                    href={`#${section.id}`}
                    aria-label={`Link to ${section.title}`}
                    className="text-faint opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
                  >
                    <MIcon name="link" className="text-[18px]" />
                  </a>
                </h2>
                <div className="mt-4 space-y-4 text-[14.5px] leading-[1.75] text-foreground/85 [&_strong]:font-semibold [&_strong]:text-foreground">
                  {section.body}
                </div>
              </section>
            ))}
          </div>

          <PageFeedback key={page.slug} />

          <nav aria-label="Pagination" className="mt-14 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
            {prev ? (
              <Link
                to="/docs/$slug"
                params={{ slug: prev.slug }}
                className="flex items-center gap-3 rounded-2xl border border-border p-4 hover:border-brand/50"
              >
                <MIcon name="arrow_back" className="text-[20px] text-faint" />
                <span>
                  <span className="block text-[11px] text-faint">Previous</span>
                  <span className="text-[14px] font-medium">{prev.title}</span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to="/docs/$slug"
                params={{ slug: next.slug }}
                className="flex items-center justify-end gap-3 rounded-2xl border border-border p-4 text-right hover:border-brand/50"
              >
                <span>
                  <span className="block text-[11px] text-faint">Next</span>
                  <span className="text-[14px] font-medium">{next.title}</span>
                </span>
                <MIcon name="arrow_forward" className="text-[20px] text-faint" />
              </Link>
            ) : null}
          </nav>
        </div>
      </article>

      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto py-10 pr-6 xl:block">
        <p className="text-[13px] font-semibold">On this page</p>
        <ul className="mt-3 border-l-2 border-border">
          {page.sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={cn(
                  "-ml-0.5 block border-l-2 border-transparent py-1 pl-3 text-[13px] text-muted-foreground hover:text-foreground",
                  active === s.id && "border-brand font-medium text-foreground",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0">{s.title}</span>
                  {s.isNew ? <span className="size-1.5 shrink-0 rounded-full bg-brand" title="New" /> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
