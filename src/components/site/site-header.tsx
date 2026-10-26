import { Link } from "@tanstack/react-router";

import { BrandMark } from "@/components/fireota/brand-mark";
import { ChangelogLink, GitHubStarButton, ThemeSelect } from "@/components/site/header-actions";
import { Button } from "@/components/ui/button";

/** Header for public pages outside the docs (e.g. the changelog). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-5">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="size-9" />
          <span className="font-display text-[19px] font-bold tracking-tight">FireOTA</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 text-[14px] text-muted-foreground md:flex">
          <Link to="/docs" className="rounded-full px-3 py-1.5 hover:text-foreground">
            Docs
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ChangelogLink />
          <GitHubStarButton />
          <ThemeSelect className="mr-1" />
          <Button size="sm" className="hidden sm:inline-flex" asChild>
            <Link to="/dashboard">Go to console</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
