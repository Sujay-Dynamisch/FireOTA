import { Link, createFileRoute } from "@tanstack/react-router";

import { MIcon } from "@/components/docs/docs-ui";
import { DocsHomeCards } from "@/components/docs/home-cards";
import { docGroups } from "@/components/docs/pages";

export const Route = createFileRoute("/docs/")({
  component: DocsHome,
});

function DocsHome() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">Documentation</p>
      <h1 className="mt-2 font-display text-[34px] font-bold leading-tight tracking-tight sm:text-[40px]">
        Over-the-air updates for React Native
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Ship JavaScript fixes and features without a store review, from your own Firebase project —
        with staged rollouts, checksum verification and automatic rollback.
      </p>

      <div className="mt-10">
        <DocsHomeCards />
      </div>

      <h2 className="mt-14 font-display text-[20px] font-bold tracking-tight">
        Browse all documentation
      </h2>
      <div className="mt-5 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {docGroups.map((group) => (
          <section key={group.title}>
            <h2 className="flex items-center gap-2 text-[17px] font-semibold">
              <MIcon name={group.icon} className="text-[24px] text-brand" />
              {group.title}
            </h2>
            <ul className="mt-3 space-y-2 border-l border-border pl-4">
              {group.pages.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/docs/$slug"
                    params={{ slug: p.slug }}
                    className="text-[15px] text-muted-foreground hover:text-brand"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
