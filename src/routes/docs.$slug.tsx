import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MIcon } from "@/components/docs/docs-ui";
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

          <h1 className="mt-4 font-display text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">{page.title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{page.description}</p>

          <div className="mt-8 space-y-10">
            {page.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-20">
                <h2 className="group flex items-center gap-2 font-display text-[22px] font-semibold tracking-tight">
                  {section.title}
                  <a
                    href={`#${section.id}`}
                    aria-label={`Link to ${section.title}`}
                    className="text-faint opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
                  >
                    <MIcon name="link" className="text-[18px]" />
                  </a>
                </h2>
                <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-foreground/85 [&_strong]:font-semibold [&_strong]:text-foreground">
                  {section.body}
                </div>
              </section>
            ))}
          </div>

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
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
