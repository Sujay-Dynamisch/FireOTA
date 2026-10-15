import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { MIcon } from "@/components/docs/docs-ui";
import { docGroups } from "@/components/docs/pages";
import { BrandMark } from "@/components/fireota/brand-mark";
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
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const needle = filter.trim().toLowerCase();

  const groups = useMemo(
    () =>
      docGroups
        .map((g) => ({
          ...g,
          pages: needle
            ? g.pages.filter((p) => `${p.title} ${p.description} ${g.title}`.toLowerCase().includes(needle))
            : g.pages,
        }))
        .filter((g) => g.pages.length > 0),
    [needle],
  );

  return (
    <nav aria-label="Documentation" className="flex h-full flex-col">
      <div className="p-3">
        <label className="flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-2.5 py-1.5 text-faint focus-within:border-brand/50">
          <MIcon name="filter_list" className="text-[18px]" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter documentation"
            className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto pb-6">
        <Link
          to="/docs"
          onClick={onNavigate}
          className={cn(
            "mx-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            active === "" && "bg-brand/10 font-medium text-brand",
          )}
        >
          <MIcon name="home" className="text-[18px]" />
          Documentation home
        </Link>
        {groups.map((group) => {
          const isClosed = !needle && closed[group.title];
          return (
            <div key={group.title} className="mt-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setClosed((c) => ({ ...c, [group.title]: !c[group.title] }))}
                className="flex w-full items-center gap-2 px-5 py-1 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-faint hover:text-foreground"
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
                          "mx-2 block rounded-md py-1.5 pl-9 pr-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                          active === page.slug && "bg-brand/10 font-medium text-brand hover:bg-brand/15 hover:text-brand",
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
        {groups.length === 0 ? <p className="px-5 pt-4 text-[12px] text-faint">No pages match “{filter}”.</p> : null}
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
          <Link to="/docs" className="hidden text-[14px] font-medium text-brand sm:block">
            Docs
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden gap-1.5 sm:flex" asChild>
              <Link to="/docs/$slug" params={{ slug: "quickstart" }}>
                <MIcon name="bolt" className="text-[18px]" /> Quickstart
              </Link>
            </Button>
            <Button size="sm" className="gap-1.5" asChild>
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

