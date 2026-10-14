import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/fireota/brand-mark";

export const LEGAL_UPDATED = "15 October 2026";
export const CONTACT_URL = "https://github.com/Sujay-Dynamisch/FireOTA/issues";

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-5">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark className="size-6" />
            <span className="font-display text-[16px] font-bold tracking-tight">FireOTA</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[13px] text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground [&.active]:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground [&.active]:text-foreground">
              Terms
            </Link>
            <Link to="/docs" className="hover:text-foreground">
              Docs
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">Legal</p>
        <h1 className="mt-2 font-display text-[32px] font-bold tracking-tight sm:text-[38px]">{title}</h1>
        <p className="mt-2 text-[13px] text-faint">Last updated: {LEGAL_UPDATED}</p>
        <div className="mt-6 text-[15px] leading-relaxed text-muted-foreground">{intro}</div>

        <nav aria-label="Contents" className="mt-8 rounded-lg border border-border bg-surface/40 p-4">
          <p className="mb-2 text-[12px] font-semibold">Contents</p>
          <ol className="grid list-decimal gap-1 pl-5 text-[13px] text-muted-foreground sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-brand">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="font-display text-[20px] font-semibold tracking-tight">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-foreground/85 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:space-y-1.5">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-4 font-mono text-[11px] text-faint">
          <span>© 2026 FireOTA</span>
          <Link to="/privacy" className="hover:text-muted-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-muted-foreground">
            Terms of Service
          </Link>
          <Link to="/docs" className="hover:text-muted-foreground">
            Documentation
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function Contact() {
  return (
    <a href={CONTACT_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
      our GitHub issue tracker
    </a>
  );
}
