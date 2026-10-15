import { Link, createFileRoute } from "@tanstack/react-router";

import { MIcon } from "@/components/docs/docs-ui";
import { ProductVideo } from "@/components/fireota/product-video";
import { docGroups } from "@/components/docs/pages";

export const Route = createFileRoute("/docs/")({
  component: DocsHome,
});

const highlights = [
  { slug: "quickstart", icon: "bolt", title: "Quickstart", text: "From an app without OTA to your first update, step by step." },
  { slug: "android-setup", icon: "android", title: "Android setup", text: "Load verified OTA bundles in release builds." },
  { slug: "ios-setup", icon: "phone_iphone", title: "iOS setup", text: "Wire FireOTA into your AppDelegate." },
  { slug: "publish", icon: "cloud_upload", title: "Publish an update", text: "Bundle, upload to your Firebase Storage and publish." },
];

function DocsHome() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">Documentation</p>
      <h1 className="mt-2 font-display text-[34px] font-bold leading-tight tracking-tight sm:text-[40px]">
        Over-the-air updates for React Native
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Ship JavaScript fixes and features without a store review, from your own Firebase project — with staged rollouts,
        checksum verification and automatic rollback.
      </p>

      <ProductVideo className="mt-8" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {highlights.map((h) => (
          <Link
            key={h.slug}
            to="/docs/$slug"
            params={{ slug: h.slug }}
            className="group flex gap-4 rounded-xl border border-border bg-surface/40 p-5 transition-colors hover:border-brand/50 hover:bg-surface"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <MIcon name={h.icon} className="text-[24px]" />
            </span>
            <span>
              <span className="flex items-center gap-1 text-[15px] font-semibold">
                {h.title}
                <MIcon name="arrow_forward" className="text-[16px] opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-1 block text-[13px] text-muted-foreground">{h.text}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {docGroups.map((group) => (
          <section key={group.title}>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
              <MIcon name={group.icon} className="text-[20px] text-brand" />
              {group.title}
            </h2>
            <ul className="mt-2 space-y-1.5 border-l border-border pl-4">
              {group.pages.map((p) => (
                <li key={p.slug}>
                  <Link to="/docs/$slug" params={{ slug: p.slug }} className="text-[13px] text-muted-foreground hover:text-brand">
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
