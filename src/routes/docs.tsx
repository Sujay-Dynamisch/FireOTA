import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { DocsSearch } from "@/components/docs/docs-search";
import { MIcon } from "@/components/docs/docs-ui";
import { docGroups } from "@/components/docs/pages";
import { BrandMark } from "@/components/fireota/brand-mark";
import { ChangelogLink, GitHubStarButton, ThemeSelect } from "@/components/site/header-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "FireOTA Documentation" },
      {
        name: "description",
        content:
          "Add over-the-air updates to a React Native app with FireOTA: Firebase setup, SDK installation, native wiring, publishing, rollouts, rollback and CI.",
      },
      { property: "og:title", content: "FireOTA Documentation" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400,0..1,0&display=block",
      },
    ],
  }),
  component: DocsLayout,
});

function useActiveSlug() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path.replace(/^\/docs\/?/, "").split("/")[0] ?? "";
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const active = useActiveSlug();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = docGroups;

  return (
    <nav aria-label="Documentation" className="flex h-full flex-col">
      <div className="p-3">
        <DocsSearch {...(onNavigate ? { onNavigate } : {})} />
      </div>
      <div className="flex-1 overflow-y-auto pb-6">
        <Link
          to="/docs"
          onClick={onNavigate}
          className={cn(
            "mx-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground dark:text-white",
            active === "" && "bg-brand/10 font-medium text-brand dark:text-brand",
          )}
        >
          <MIcon name="home" className="text-[18px]" />
          Documentation home
        </Link>
        <Link
          to="/changelog"
          onClick={onNavigate}
          className="mx-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground dark:text-white"
        >
          <MIcon name="history" className="text-[18px]" />
          Changelog
        </Link>
        {groups.map((group) => {
          const isClosed = closed[group.title];
          return (
            <div key={group.title} className="mt-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setClosed((c) => ({ ...c, [group.title]: !c[group.title] }))}
                className="flex w-full items-center gap-2 px-5 py-1 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-faint hover:text-foreground dark:text-white/70 dark:hover:text-white"
                aria-expanded={!isClosed}
              >
                <MIcon name={group.icon} className="text-[16px]" />
                <span className="flex-1">{group.title}</span>
                <MIcon name={isClosed ? "expand_more" : "expand_less"} className="text-[18px]" />
              </button>
              {!isClosed ? (
                <ul className="mt-1 space-y-0.5">
                  {group.pages.map((page) => (
                    <li key={page.slug}>
                      <Link
                        to="/docs/$slug"
                        params={{ slug: page.slug }}
                        onClick={onNavigate}
                        className={cn(
                          "mx-2 block rounded-md py-1.5 pl-9 pr-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground dark:text-white",
                          active === page.slug && "bg-brand/10 font-medium text-brand hover:bg-brand/15 hover:text-brand dark:text-brand",
                        )}
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function DocsLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label="Open documentation menu">
                <MIcon name="menu" className="text-[22px]" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="flex h-14 items-center gap-2 border-b border-border px-4 text-left text-[14px]">
                <BrandMark /> FireOTA Docs
              </SheetTitle>
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link to="/" className="flex items-center gap-2">
            <BrandMark className="size-9" />
            <span className="font-display text-[19px] font-bold tracking-tight">FireOTA</span>
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <Link to="/docs" className="hidden items-center gap-2 text-[17px] font-semibold text-brand sm:flex">
            <img src="/media/docs-icon.png" alt="" aria-hidden width={32} height={32} className="size-8" />
            Docs
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <ChangelogLink />
            <GitHubStarButton />
            <ThemeSelect className="mr-1" />
            <Button variant="ghost" size="sm" className="hidden gap-1.5 xl:flex" asChild>
              <Link to="/docs/$slug" params={{ slug: "quickstart" }}>
                <MIcon name="bolt" className="text-[18px]" /> Quickstart
              </Link>
            </Button>
            <Button size="sm" className="hidden gap-1.5 sm:inline-flex" asChild>
              <Link to="/dashboard">
                Go to console <MIcon name="arrow_forward" className="text-[16px]" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 border-r border-border bg-surface/30 lg:block">
          <Sidebar />
        </aside>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

