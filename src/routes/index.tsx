import { Link, createFileRoute } from "@tanstack/react-router";
import { BrandMark } from "@/components/fireota/brand-mark";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/fireota/primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FireOTA — Firebase-powered OTA releases for React Native" },
      {
        name: "description",
        content:
          "FireOTA manages React Native OTA releases inside your own Firebase project: channels, staged rollouts, instant rollback and audit logs. Free at the platform level.",
      },
      { property: "og:title", content: "FireOTA — Firebase-powered OTA releases for React Native" },
      {
        property: "og:description",
        content:
          "Connect your Firebase project, upload a bundle and publish a staged rollout. Your files never leave your Firebase Storage.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-5">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-display text-[15px] font-bold tracking-tight">FireOTA</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-4 text-[12px] text-muted-foreground sm:flex">
            <Link to="/docs" className="hover:text-foreground">
              Documentation
            </Link>
            <Link to="/agents" className="hover:text-foreground">
              Agents
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">Create account</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand">React Native OTA · your Firebase</p>
        <h1 className="mt-4 max-w-2xl font-display text-[40px] font-bold leading-[1.05] tracking-tight">
          Ship React Native updates without owning the infrastructure.
        </h1>
        <p className="mt-4 max-w-xl text-[14px] text-muted-foreground">
          Connect your Firebase project and manage OTA releases from one place. Bundles, assets and manifests stay in
          your own Firebase Storage — FireOTA is free at the platform level and never holds your files.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to="/signup">Create account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/docs">Read the docs</Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-3">
          {[
            ["Channels", "Production, beta, staging, development and custom channels per application."],
            ["Staged rollouts", "Advance a release one notch at a time, pause it, or roll back instantly."],
            ["Audit + agents", "Every action recorded, with a permissioned agent layer that never acts unapproved."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-lg border border-border bg-surface/50 p-4">
              <h2 className="font-display text-[14px] font-bold tracking-tight">{title}</h2>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 max-w-xl">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Publish from CI</p>
          <CodeBlock code="fireota release --channel production --publish" />
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 font-mono text-[10px] text-faint">
          <span>FireOTA · OTA release management for React Native</span>
          <Link to="/docs" className="hover:text-muted-foreground">
            Documentation
          </Link>
        </div>
      </footer>
    </div>
  );
}
