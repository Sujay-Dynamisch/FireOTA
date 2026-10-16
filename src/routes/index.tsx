import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Cloud,
  GitBranch,
  History,
  Layers,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/fireota/brand-mark";
import { ProductVideo } from "@/components/fireota/product-video";
import { CodeBlock } from "@/components/fireota/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

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
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "FireOTA",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Android, iOS",
          description:
            "FireOTA manages React Native OTA releases inside your own Firebase project: channels, staged rollouts, instant rollback and audit logs.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Landing,
});

/** Fades and lifts its children into view the first time they scroll on screen. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Landing() {
  const { user, loading } = useAuthUser();
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-10" />
            <span className="font-display text-[20px] font-bold tracking-tight">FireOTA</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-5 text-[13px] text-muted-foreground md:flex">
            <a href="#demo" className="hover:text-foreground">
              Demo
            </a>
            <a href="#rollout" className="hover:text-foreground">
              Rollouts
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <Link to="/docs" className="hover:text-foreground">
              Documentation
            </Link>
          </nav>
          <div className="ml-auto flex min-h-8 items-center gap-2">
            {loading ? null : user ? (
              <>
                <span className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
                  ) : (
                    <span className="grid size-7 place-items-center rounded-full bg-brand/20 font-mono text-[10px] text-brand">
                      {(user.name || user.email).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[180px] truncate">{user.name || user.email}</span>
                </span>
                <Button size="sm" asChild>
                  <Link to="/dashboard">Open dashboard</Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/signup">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.22),transparent)] blur-2xl"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
                <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                React Native OTA · your Firebase
              </span>
              <h1 className="mt-5 font-display text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
                Ship React Native updates{" "}
                <span className="bg-gradient-to-r from-[#FF5A1F] via-[#FF8A1F] to-[#FFB21E] bg-clip-text text-transparent">
                  in minutes
                </span>
                , not app-store weeks.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Connect your Firebase project and manage OTA releases from one place. Bundles, assets and manifests stay
                in your own Firebase Storage — FireOTA is free at the platform level and never holds your files.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" asChild className="group">
                  {user ? (
                    <Link to="/dashboard">
                      Open dashboard <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  ) : (
                    <Link to="/signup">
                      Get started free <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#demo">
                    <Play className="fill-current" /> Watch demo
                  </a>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-faint">
                <span>✓ No credit card</span>
                <span>✓ Your Firebase, your data</span>
                <span>✓ Open-source SDK + CLI</span>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute -inset-3 rounded-[1.4rem] bg-gradient-to-br from-[#FF5A1F]/40 via-transparent to-[#FFB21E]/30 blur-xl"
                />
                <ProductVideo className="relative" />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y border-border bg-surface/30">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 md:grid-cols-4">
            {[
              [0, "$", "platform cost"],
              [100, "%", "of files in your Firebase"],
              [1, " click", "instant rollback"],
              [5, "", "channels out of the box"],
            ].map(([n, suffix, label], i) => (
              <Reveal key={String(label)} delay={i * 80} className="text-center">
                <CountUp
                  to={Number(n)}
                  prefix={suffix === "$" ? "$" : ""}
                  suffix={suffix === "$" ? "" : String(suffix)}
                />
                <p className="mt-1 text-[12px] text-muted-foreground">{label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Demo */}
        <section id="demo" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-20">
          <Reveal className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">Product tour</p>
            <h2 className="mt-2 font-display text-[30px] font-bold tracking-tight sm:text-[36px]">
              See a release go from upload to every phone
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[14px] text-muted-foreground">
              Sign in, connect Firebase, add an app, publish a bundle and roll it out — in under five minutes.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10">
            <ProductVideo />
          </Reveal>
        </section>

        {/* Rollout simulator */}
        <section id="rollout" className="scroll-mt-20 border-y border-border bg-surface/30">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">Try it</p>
              <h2 className="mt-2 font-display text-[30px] font-bold tracking-tight sm:text-[36px]">
                Staged rollouts you can feel
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Drag the slider. Each device is hashed into a stable bucket, so raising the percentage only ever adds
                devices — nobody flips back and forth between versions. Pause at any time, or roll back instantly.
              </p>
              <ul className="mt-6 space-y-2 text-[13px] text-muted-foreground">
                {["Deterministic per-device buckets", "Pause and resume without losing progress", "One-click rollback to the previous release"].map(
                  (t) => (
                    <li key={t} className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-brand" /> {t}
                    </li>
                  ),
                )}
              </ul>
            </Reveal>
            <Reveal delay={120}>
              <RolloutSimulator />
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <Reveal className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">How it works</p>
            <h2 className="mt-2 font-display text-[30px] font-bold tracking-tight sm:text-[36px]">Four steps to your first OTA</h2>
          </Reveal>
          <Reveal delay={120} className="mt-10">
            <HowItWorks />
          </Reveal>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-surface/30">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <Reveal className="text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">Everything included</p>
              <h2 className="mt-2 font-display text-[30px] font-bold tracking-tight sm:text-[36px]">
                Built for teams that ship often
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 90}>
                  <div className="group h-full rounded-xl border border-border bg-background/60 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand/50 hover:shadow-[0_20px_50px_-25px_rgba(255,90,31,0.5)]">
                    <span className="grid size-10 place-items-center rounded-lg bg-brand/12 text-brand transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                      <f.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-display text-[16px] font-bold tracking-tight">{f.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.copy}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 py-20">
          <Reveal className="text-center">
            <h2 className="font-display text-[30px] font-bold tracking-tight sm:text-[36px]">Questions</h2>
          </Reveal>
          <Reveal delay={100} className="mt-8">
            <Accordion type="single" collapsible className="rounded-xl border border-border px-5">
              {FAQ.map(([q, a]) => (
                <AccordionItem key={q} value={q}>
                  <AccordionTrigger className="text-[14px]">{q}</AccordionTrigger>
                  <AccordionContent className="text-[13px] leading-relaxed text-muted-foreground">{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </section>

        {/* CTA */}
        <section className="px-5 pb-20">
          <Reveal>
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-[#FF5A1F]/15 via-surface to-[#FFB21E]/10 px-6 py-14 text-center">
              <BrandMark className="mx-auto size-16" />
              <h2 className="mt-5 font-display text-[28px] font-bold tracking-tight sm:text-[34px]">
                Your next fix can be live today.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-[14px] text-muted-foreground">
                Free at the platform level. Your Firebase plan, your files, your rules.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button size="lg" asChild>
                  {user ? <Link to="/dashboard">Open dashboard</Link> : <Link to="/signup">Create free account</Link>}
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/docs">Read the docs</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 font-mono text-[10px] text-faint">
          <span className="flex items-center gap-2">
            <BrandMark className="size-6" /> FireOTA · OTA release management for React Native
          </span>
          <div className="flex gap-4">
            <Link to="/docs" className="hover:text-muted-foreground">
              Documentation
            </Link>
            <Link to="/privacy" className="hover:text-muted-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-muted-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CountUp({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (to === 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <p className="font-display text-[32px] font-bold tracking-tight text-foreground">
      {prefix}
      {n}
      <span className="text-brand">{suffix}</span>
    </p>
  );
}

/** Same FNV-1a bucketing idea the SDK uses: a device's bucket never changes for a release. */
function bucket(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

const DEVICE_COUNT = 60;

function RolloutSimulator() {
  const [pct, setPct] = useState(10);
  const [paused, setPaused] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const buckets = useMemo(() => Array.from({ length: DEVICE_COUNT }, (_, i) => bucket(`device-${i}:1.3.1`)), []);
  const effective = rolledBack ? 0 : pct;
  const updated = buckets.filter((b) => b < effective).length;

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-[0_30px_80px_-40px_rgba(255,90,31,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">production · android</p>
          <p className="font-display text-[16px] font-bold">
            Release 1.3.1{" "}
            <span
              className={cn(
                "ml-1 rounded-full px-2 py-0.5 align-middle font-mono text-[10px] font-medium",
                rolledBack
                  ? "bg-red-500/15 text-red-400"
                  : paused
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-emerald-500/15 text-emerald-400",
              )}
            >
              {rolledBack ? "rolled back" : paused ? "paused" : "rolling out"}
            </span>
          </p>
        </div>
        <p className="font-display text-[28px] font-bold text-brand">{effective}%</p>
      </div>

      <div className="mt-5 grid grid-cols-10 gap-2">
        {buckets.map((b, i) => {
          const on = b < effective;
          return (
            <span
              key={i}
              title={`bucket ${b}`}
              className={cn(
                "grid aspect-[4/5] place-items-center rounded-md border transition-all duration-500",
                on
                  ? "scale-105 border-brand/60 bg-brand/20 text-brand shadow-[0_0_16px_rgba(255,90,31,0.35)]"
                  : "border-border bg-surface/50 text-faint",
              )}
            >
              <Smartphone className="size-3.5" />
            </span>
          );
        })}
      </div>

      <div className="mt-6">
        <Slider
          value={[pct]}
          min={0}
          max={100}
          step={1}
          disabled={paused || rolledBack}
          onValueChange={(v) => setPct(v[0] ?? 0)}
          aria-label="Rollout percentage"
        />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-faint">
          <span>0%</span>
          <span>
            {updated} of {DEVICE_COUNT} devices on 1.3.1
          </span>
          <span>100%</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {[10, 25, 50, 100].map((p) => (
          <Button
            key={p}
            size="sm"
            variant={pct === p && !rolledBack ? "default" : "outline"}
            disabled={paused || rolledBack}
            onClick={() => setPct(p)}
          >
            {p}%
          </Button>
        ))}
        <Button size="sm" variant="outline" disabled={rolledBack} onClick={() => setPaused((x) => !x)}>
          {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRolledBack((x) => !x);
            setPaused(false);
          }}
        >
          <RotateCcw /> {rolledBack ? "Re-publish" : "Rollback"}
        </Button>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Connect Firebase",
    copy: "Sign in with Google and pick your Firebase project. Releases are stored in your own Storage bucket and Firestore.",
    code: "# In the dashboard\nProjects → Connect Firebase → choose your project",
  },
  {
    title: "Install the SDK",
    copy: "Add the React Native SDK. It checks for updates on launch and applies them on the next restart.",
    code: "npm install @fireota/react-native\ncd ios && pod install",
  },
  {
    title: "Publish a release",
    copy: "Bundle and upload from your machine or CI with the FireOTA CLI.",
    code: "npx fireota publish --app YOUR_APP_ID --platform android \\\n  --version 1.3.1 --runtime 1.3.0 --rollout 10",
  },
  {
    title: "Roll out & monitor",
    copy: "Raise the rollout percentage, watch adoption and errors, pause or roll back with one click.",
    code: "npx fireota release rollout RELEASE_ID --percentage 50",
  },
];

function HowItWorks() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4500);
    return () => clearInterval(t);
  }, [auto]);
  const step = STEPS[active]!;
  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setAuto(false);
              }}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-300",
                i === active ? "border-brand/60 bg-brand/8" : "border-border hover:border-brand/30 hover:bg-surface/50",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full font-mono text-[12px] font-bold transition-colors",
                    i === active ? "bg-brand text-white" : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="font-display text-[15px] font-bold">{s.title}</span>
              </span>
              {i === active && (
                <span className="mt-2 block pl-11 text-[13px] text-muted-foreground">{s.copy}</span>
              )}
              {i === active && auto && (
                <span
                  key={active}
                  className="absolute bottom-0 left-0 h-0.5 bg-brand"
                  style={{ animation: "fireota-progress 4.5s linear forwards" }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>
      <div className="self-center">
        <div key={active} className="animate-in fade-in slide-in-from-right-4 duration-500">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
            Step {active + 1} · {step.title}
          </p>
          <CodeBlock code={step.code} />
        </div>
      </div>
      <style>{`@keyframes fireota-progress{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}

const FEATURES = [
  { icon: Cloud, title: "Your Firebase, your files", copy: "Bundles and manifests live in your Storage bucket. FireOTA never holds your code." },
  { icon: GitBranch, title: "Channels", copy: "Production, beta, staging, development and custom channels per application." },
  { icon: Layers, title: "Staged rollouts", copy: "Advance a release one notch at a time with stable per-device buckets." },
  { icon: RotateCcw, title: "Instant rollback", copy: "Atomically point a channel back at the previous release in one click." },
  { icon: History, title: "Full audit trail", copy: "Every publish, rollout change and rollback is recorded with who and when." },
  { icon: Bot, title: "Agents, with approval", copy: "A permissioned agent layer that suggests actions and never acts unapproved." },
  { icon: Zap, title: "CLI + CI ready", copy: "Publish from GitHub Actions or any CI with a single npx command." },
  { icon: Smartphone, title: "Native SDK", copy: "Lightweight Android and iOS code — downloads, verifies and applies on restart." },
  { icon: ShieldCheck, title: "Secure by default", copy: "Encrypted credentials, row-level security and scoped Google consent." },
];

const FAQ: [string, string][] = [
  [
    "Is FireOTA really free?",
    "Yes. FireOTA charges nothing at the platform level. Storage and bandwidth are billed by Firebase on your own plan, usually within the free tier for small apps.",
  ],
  [
    "Does FireOTA store my JavaScript bundles?",
    "No. Bundles, assets and manifests are uploaded to your Firebase Storage and Firestore. FireOTA only keeps release metadata.",
  ],
  [
    "Which changes can I ship over the air?",
    "JavaScript and asset changes. Native code changes still need an app-store release — FireOTA uses runtime versions so an update only reaches compatible binaries.",
  ],
  [
    "What happens if a release is bad?",
    "Pause the rollout to stop new devices updating, or roll back to point the channel at the previous release instantly.",
  ],
  [
    "Is it allowed by the App Store and Google Play?",
    "Both allow updating interpreted JavaScript as long as the app's primary purpose doesn't change. Follow the store guidelines for what you ship.",
  ],
];
