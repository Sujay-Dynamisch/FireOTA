import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Cloud,
  Cpu,
  ExternalLink,
  Flame,
  GitBranch,
  Globe,
  History,
  Layers,
  Lock,
  Maximize2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/fireota/brand-mark";
import { CiLogo, Icons8Credit, type CiTool } from "@/components/fireota/ci-logos";
import { ComparisonTable } from "@/components/fireota/comparison";
import { ProductVideo } from "@/components/fireota/product-video";import { CodeBlock, CopyButton } from "@/components/fireota/primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { EcosystemLogo, type EcosystemId } from "@/components/fireota/ecosystem-logos";
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FireOTA — Firebase-Powered OTA Releases for React Native" },
      {
        name: "description",
        content:
          "FireOTA brings Expo-grade Over-The-Air releases to React Native using your own Firebase Storage. Staged rollouts, deterministic bucketing, instant 1-click rollback, and zero platform cost.",
      },
      { property: "og:title", content: "FireOTA — Sovereign OTA Releases for React Native" },
      {
        property: "og:description",
        content:
          "Connect your Firebase project, upload a bundle and publish a staged rollout in minutes. Your files never leave your Firebase Storage.",
      },
      { property: "og:image", content: "/media/fireota-hero-banner.jpg" },
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
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
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
      { threshold: 0.12 },
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

const CI_TOOLS: CiTool[] = [
  "github",
  "gitlab",
  "bitbucket",
  "jenkins",
  "azure",
  "circleci",
  "bitrise",
];

const ECOSYSTEM_BRANDS: { id: EcosystemId; name: string; tag: string }[] = [
  { id: "react-native", name: "React Native", tag: "Native Runtime" },
  { id: "firebase", name: "Firebase Storage", tag: "Private Bucket" },
  { id: "google-cloud", name: "Google Cloud", tag: "Global CDN" },
  { id: "expo", name: "Expo Config Plugins", tag: "Managed & Bare" },
  { id: "android", name: "Android Native", tag: "Hermes & JSC" },
  { id: "apple", name: "Apple iOS", tag: "Store Compliant" },
  { id: "github", name: "GitHub Actions", tag: "Automated CI" },
  { id: "fastlane", name: "Fastlane", tag: "Release Track" },
  { id: "gitlab", name: "GitLab CI", tag: "Pipeline Ready" },
  { id: "bitrise", name: "Bitrise", tag: "Mobile DevOps" },
];

function Landing() {
  const { user, loading } = useAuthUser();
  const [heroView, setHeroView] = useState<"banner" | "video">("banner");
  const [cliPm, setCliPm] = useState<"npx" | "bunx" | "pnpm">("npx");
  const [archModalOpen, setArchModalOpen] = useState(false);

  const cliCommand =
    cliPm === "bunx"
      ? "bunx fireota publish --app production --platform android --rollout 10"
      : cliPm === "pnpm"
        ? "pnpm dlx fireota publish --app production --platform android --rollout 10"
        : "npx fireota publish --app production --platform android --rollout 10";

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-brand/20 selection:text-brand">
      {/* Glow ambient background backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-grid-dev opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"
      />

      {/* Modern Expo-style Frosted Header */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="group flex items-center gap-2.5">
              <div className="relative">
                <BrandMark className="size-9 transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute -inset-1 -z-10 rounded-full bg-brand/30 blur-sm opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <span className="font-display text-[20px] font-bold tracking-tight">FireOTA</span>
            </Link>

            <nav className="hidden items-center gap-6 text-[13px] font-medium text-muted-foreground md:flex">
              <a href="#overview" className="transition-colors hover:text-foreground">
                Overview
              </a>
              <a href="#architecture" className="transition-colors hover:text-foreground">
                Architecture
              </a>
              <a href="#features" className="transition-colors hover:text-foreground">
                Features
              </a>
              <a href="#rollout" className="transition-colors hover:text-foreground">
                Simulator
              </a>
              <a href="#how" className="transition-colors hover:text-foreground">
                Workflow
              </a>
              <Link to="/docs" className="transition-colors hover:text-foreground">
                Docs
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Sujay-Dynamisch/FireOTA"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 font-mono text-[11px] text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground sm:inline-flex"
            >
              <EcosystemLogo id="github" className="size-3.5 text-foreground" />
              <span>GitHub</span>
            </a>

            {loading ? (
              <div className="h-8 w-20 animate-pulse rounded-md bg-surface-2" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="hidden items-center gap-2 text-[12px] text-muted-foreground lg:flex">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="size-7 rounded-full border border-border"
                    />
                  ) : (
                    <span className="grid size-7 place-items-center rounded-full bg-brand/20 font-mono text-[10px] font-bold text-brand">
                      {(user.name || user.email).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[140px] truncate">{user.name || user.email}</span>
                </span>
                <Button size="sm" asChild className="shadow-sm shadow-brand/20">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="text-[13px]">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="shadow-md shadow-brand/25 transition-transform active:scale-95"
                >
                  <Link to="/signup">
                    Get started <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* ========================================================================= */}
        {/* HERO SECTION                                                             */}
        {/* ========================================================================= */}
        <section id="overview" className="relative pt-10 sm:pt-16 pb-16 lg:pb-24">
          {/* Radiant radial gradient spotlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[650px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(255,90,31,0.22)_0%,rgba(255,140,31,0.08)_45%,transparent_75%)] blur-3xl"
          />

          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-4xl text-center">
              <Reveal delay={80}>
                <h1 className="mt-6 font-display text-[42px] font-extrabold leading-[1.08] tracking-tight sm:text-[62px] lg:text-[70px]">
                  Ship React Native updates{" "}
                  <span className="bg-gradient-to-r from-[#FF5A1F] via-[#FF8A1F] to-[#FFB21E] bg-clip-text text-transparent">
                    in minutes
                  </span>
                  ,<br className="hidden sm:inline" /> not app-store weeks.
                </h1>
              </Reveal>

              <Reveal delay={140}>
                <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
                  The developer-first OTA release management platform powered directly by your own
                  Firebase project. Zero storage markups, deterministic staged rollouts, and instant
                  1-click rollback with full data sovereignty.
                </p>
              </Reveal>

              {/* CTAs */}
              <Reveal delay={180}>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    size="lg"
                    asChild
                    className="group h-12 px-6 shadow-lg shadow-brand/25 text-[15px]"
                  >
                    {user ? (
                      <Link to="/dashboard">
                        Open Dashboard{" "}
                        <ArrowRight className="transition-transform group-hover:translate-x-1" />
                      </Link>
                    ) : (
                      <Link to="/signup">
                        Start Deploying Free{" "}
                        <ArrowRight className="transition-transform group-hover:translate-x-1" />
                      </Link>
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 border-border/90 bg-surface/70 px-5 text-[14px] hover:border-brand/40 cursor-pointer"
                    asChild
                  >
                    <Link to="/docs">
                      <Play className="size-4 fill-current text-brand" />
                      View Docs
                    </Link>
                  </Button>
                </div>
              </Reveal>

              {/* Interactive Quick CLI Copy Bar (Expo Style) */}
              <Reveal delay={220} className="mt-8 flex justify-center">
                <div className="w-full max-w-xl rounded-2xl border border-border/80 bg-surface/90 p-2 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2 px-2 text-xs">
                    <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <Terminal className="size-3.5 text-brand" />
                      <span>Instant Publish CLI</span>
                    </div>
                    <div className="flex items-center rounded-lg bg-surface-2 p-0.5 font-mono text-[11px]">
                      {(["npx", "bunx", "pnpm"] as const).map((pm) => (
                        <button
                          key={pm}
                          type="button"
                          onClick={() => setCliPm(pm)}
                          className={cn(
                            "rounded px-2 py-0.5 transition-colors",
                            cliPm === pm
                              ? "bg-brand text-white font-medium"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {pm}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 px-2 py-1 font-mono text-[12px]">
                    <span className="truncate text-foreground/90">{cliCommand}</span>
                    <CopyButton value={cliCommand} label="Copy" />
                  </div>
                </div>
              </Reveal>

              <Reveal delay={250}>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] text-faint">
                  <span className="flex items-center gap-1.5">
                    <Check className="size-3 text-brand" /> $0 Platform Fee
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="size-3 text-brand" /> 100% in Your Firebase Storage
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="size-3 text-brand" /> Open-Source SDK & CLI
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="size-3 text-brand" /> App Store & Google Play Compliant
                  </span>
                </div>
              </Reveal>
            </div>

          </div>
        </section>

        {/* ========================================================================= */}
        {/* STATS & ECOSYSTEM MARQUEE                                                */}
        {/* ========================================================================= */}
        <section className="border-y border-border/80 bg-surface/40 backdrop-blur-sm py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {[
                {
                  n: 0,
                  prefix: "$",
                  suffix: "",
                  label: "Platform cost",
                  hint: "Free forever at platform level",
                },
                {
                  n: 100,
                  prefix: "",
                  suffix: "%",
                  label: "Files in your Firebase",
                  hint: "Never touches third-party servers",
                },
                {
                  n: 1,
                  prefix: "< 200",
                  suffix: "ms",
                  label: "Atomic rollback",
                  hint: "Instant revert with zero store delay",
                },
                {
                  n: 5,
                  prefix: "",
                  suffix: "+",
                  label: "Release channels",
                  hint: "Production, Staging, Beta & Custom",
                },
              ].map((stat, i) => (
                <Reveal key={stat.label} delay={i * 60} className="text-center sm:text-left">
                  <div className="flex flex-col items-center sm:items-start">
                    <p className="font-display text-[34px] sm:text-[40px] font-extrabold tracking-tight text-foreground">
                      {stat.prefix}
                      {stat.n}
                      <span className="text-brand">{stat.suffix}</span>
                    </p>
                    <p className="mt-1 font-display text-[14px] font-semibold text-foreground">
                      {stat.label}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{stat.hint}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Infinite Ecosystem Marquee */}
            <div className="mt-12 pt-8 border-t border-border/50">
              <p className="text-center font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                Seamlessly integrated with modern React Native & DevOps tooling
              </p>
              <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
                <div className="flex w-max animate-marquee gap-6 py-3 pr-6 hover:[animation-play-state:paused]">
                  {[...ECOSYSTEM_BRANDS, ...ECOSYSTEM_BRANDS].map((eco, idx) => (
                    <div
                      key={`${eco.id}-${idx}`}
                      className="flex items-center gap-3 rounded-full border border-border/80 bg-surface/80 py-2.5 pl-3 pr-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-surface-2/90"
                    >
                      <EcosystemLogo id={eco.id} className="size-8" />
                      <span className="font-display text-[16px] font-semibold text-foreground">
                        {eco.name}
                      </span>
                      <span className="font-mono text-[12px] text-muted-foreground">
                        ({eco.tag})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ZERO-TRUST ARCHITECTURE SECTION                                          */}
        {/* ========================================================================= */}
        <section id="architecture" className="relative scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="text-center max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
                <Lock className="size-3.5" />
                Data Sovereignty & Privacy
              </span>
              <h2 className="mt-3 font-display text-[32px] font-bold tracking-tight sm:text-[44px]">
                Your bundles stay in your Firebase. Period.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                Unlike closed-box OTA providers that ingest your proprietary source code, FireOTA
                operates on a sovereign zero-trust model. Releases, assets, and source maps stream
                directly into your Google Cloud Storage.
              </p>
            </Reveal>

            {/* Architecture Overview Action Bar */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-surface/50 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-brand/12 text-brand">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-[15px] font-bold text-foreground">
                    Sovereign Release Infrastructure
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    FireOTA never holds your code. Binary bundles stream directly into your Google
                    Cloud Storage bucket.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setArchModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 font-mono text-[11px] font-semibold text-brand transition-all hover:bg-brand/20 cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
                <span>View System Architecture Blueprint</span>
              </button>
            </div>

            {/* Architecture Explanatory 4 Pillars */}
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Server,
                  plane: "04 · Artifact Plane",
                  title: "Direct Firebase Storage",
                  copy: "Bundles stream directly from your CI/CD to your own Google Cloud Storage bucket. FireOTA never proxies or retains your proprietary code.",
                },
                {
                  icon: ShieldCheck,
                  plane: "02 · Control Plane",
                  title: "Policy & Metadata Only",
                  copy: "FireOTA manages cryptographic manifests, deterministic bucket hashing, and atomic rollback pointers without holding files.",
                },
                {
                  icon: Lock,
                  plane: "03 · Data & Identity",
                  title: "Scoped OAuth & Security",
                  copy: "Granular Google Cloud OAuth with PKCE and row-level Postgres security ensure team-level isolation and instant credential revocation.",
                },
                {
                  icon: Smartphone,
                  plane: "01 · App Clients",
                  title: "Direct Client Downloads",
                  copy: "Runtime mobile SDK downloads directly from Firebase CDN at wire speed with local SHA-256 integrity checks and splash-safe restarts.",
                },
              ].map((item) => (
                <Reveal key={item.title} delay={120}>
                  <div className="h-full rounded-2xl border border-border/70 bg-surface/40 p-5 transition-all duration-300 hover:border-brand/40 hover:bg-surface/80">
                    <div className="flex items-center justify-between">
                      <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
                        <item.icon className="size-4.5" />
                      </span>
                      <span className="font-mono text-[10px] text-brand/80 font-semibold">
                        {item.plane}
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-[15px] font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {item.copy}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* EXPO-STYLE BENTO GRID FEATURES                                            */}
        {/* ========================================================================= */}
        <section
          id="features"
          className="relative scroll-mt-20 border-t border-border/80 bg-surface/30 py-20 lg:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="text-center max-w-3xl mx-auto">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
                Platform Capabilities
              </span>
              <h2 className="mt-3 font-display text-[32px] font-bold tracking-tight sm:text-[44px]">
                Built for mobile engineering teams that ship daily
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                Everything you need to orchestrate updates with complete confidence, granular
                rollouts, and automatic fallbacks.
              </p>
            </Reveal>

            {/* Bento Grid */}
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* Bento 1: Staged Rollouts (2 cols wide) */}
              <Reveal className="sm:col-span-2">
                <div className="group relative h-full overflow-hidden rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand/12 text-brand">
                      <Layers className="size-6" />
                    </span>
                    <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-mono text-[11px] font-bold text-brand">
                      Deterministic Bucketing
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-[22px] font-bold tracking-tight">
                    Staged Rollouts with Zero Device Oscillation
                  </h3>
                  <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                    Advance releases smoothly: 10% → 25% → 50% → 100%. Devices are mapped to stable
                    buckets via FNV-1a hashing. Increasing the rollout percentage strictly adds new
                    devices — no phone ever flips backwards.
                  </p>

                  <div className="mt-6 rounded-2xl border border-border/70 bg-surface/60 p-4">
                    <div className="flex justify-between items-center text-xs font-mono mb-2">
                      <span className="text-muted-foreground">Rollout Adoption Curve</span>
                      <span className="text-brand font-bold">50% Active Rollout</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-surface-2 overflow-hidden flex">
                      <div
                        className="h-full bg-brand transition-all duration-700"
                        style={{ width: "50%" }}
                      />
                      <div className="h-full bg-brand/30 animate-pulse" style={{ width: "15%" }} />
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[10px] text-faint">
                      <span>0% Target</span>
                      <span>Staged: 50% deterministic bucket</span>
                      <span>100% Target</span>
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Bento 2: Instant Rollback */}
              <Reveal delay={80}>
                <div className="group relative flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div>
                    <span className="grid size-11 place-items-center rounded-xl bg-red-500/12 text-red-400">
                      <RotateCcw className="size-6" />
                    </span>
                    <h3 className="mt-5 font-display text-[20px] font-bold tracking-tight">
                      1-Click Instant Rollback
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      Caught an unhandled exception in production? Revert the channel to the
                      previous healthy release manifest atomically. Client devices rollback on the
                      very next launch.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">
                    <RotateCcw className="size-3.5" />
                    <span>Channel pointer reverted in 140ms</span>
                  </div>
                </div>
              </Reveal>

              {/* Bento 3: Multi-Channel Matrix */}
              <Reveal delay={120}>
                <div className="group relative flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div>
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-500/12 text-blue-400">
                      <GitBranch className="size-6" />
                    </span>
                    <h3 className="mt-5 font-display text-[20px] font-bold tracking-tight">
                      Release Channels Matrix
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      Route updates effortlessly across production, staging, beta, and feature
                      branches. Test internal builds without affecting real store users.
                    </p>

                    {/* Channel Router Matrix Widget */}
                    <div className="mt-5 rounded-2xl border border-border/70 bg-surface/70 p-3.5 font-mono text-[11px] shadow-sm space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-faint border-b border-border/50 pb-2">
                        <span className="font-semibold text-foreground/80">CHANNEL ROUTER</span>
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live Sync
                        </span>
                      </div>
                      <div className="space-y-1.5 text-[10.5px]">
                        <div className="flex items-center justify-between">
                          <span className="text-foreground font-medium flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-emerald-500" /> production
                          </span>
                          <span className="text-emerald-400 font-semibold">100% (v1.3.1)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-foreground font-medium flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-amber-500" /> beta
                          </span>
                          <span className="text-amber-400 font-semibold">50% (v1.4.0-rc)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-foreground font-medium flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-blue-500" /> staging
                          </span>
                          <span className="text-blue-400 font-semibold">Internal Dev</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-1.5 font-mono text-[10px]">
                    <span className="rounded-md bg-emerald-500/15 text-emerald-400 px-2 py-0.5">
                      production
                    </span>
                    <span className="rounded-md bg-amber-500/15 text-amber-400 px-2 py-0.5">
                      beta
                    </span>
                    <span className="rounded-md bg-blue-500/15 text-blue-400 px-2 py-0.5">
                      staging
                    </span>
                    <span className="rounded-md bg-purple-500/15 text-purple-400 px-2 py-0.5">
                      canary-v2
                    </span>
                  </div>
                </div>
              </Reveal>

              {/* Bento 4: Agentic Intelligence (2 cols wide) */}
              <Reveal delay={160} className="sm:col-span-2">
                <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <span className="grid size-11 place-items-center rounded-xl bg-purple-500/12 text-purple-400">
                        <Bot className="size-6" />
                      </span>
                      <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 font-mono text-[11px] font-bold text-purple-300">
                        Human-in-the-Loop AI
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-[22px] font-bold tracking-tight">
                      Permissioned Agentic Release Copilot
                    </h3>
                    <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                      FireOTA includes a dedicated AI agent layer that scans runtime compatibility,
                      checks error rates across device models, and recommends rollout percentage
                      increases — but never acts without your explicit approval.
                    </p>
                  </div>

                  <div className="mt-6 rounded-2xl border border-border/70 bg-surface/60 p-4 font-mono text-[12px]">
                    <div className="flex items-center gap-2 text-purple-400">
                      <Sparkles className="size-4" />
                      <span className="font-bold">Agent Insight:</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      &quot;1.3.1 reached 25% rollout with 0 crash reports across 8,420 iOS &
                      Android devices. Recommended: Promote to 50%?&quot;
                    </p>
                    <div className="mt-3 flex gap-2">
                      <span className="rounded-md bg-brand/20 text-brand px-2 py-1 text-[11px] font-bold">
                        Approve Promotion
                      </span>
                      <span className="rounded-md bg-surface-2 text-muted-foreground px-2 py-1 text-[11px]">
                        Dismiss
                      </span>
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Bento 5: CI/CD Pipelines (Bottom Left) */}
              <Reveal delay={200}>
                <div className="group relative flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div>
                    <span className="grid size-11 place-items-center rounded-xl bg-brand/12 text-brand">
                      <Zap className="size-6" />
                    </span>
                    <h3 className="mt-5 font-display text-[20px] font-bold tracking-tight">
                      Turnkey CI/CD Pipelines
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      Publish automatically on every merge to main. First-class support for GitHub
                      Actions, GitLab CI, CircleCI, and Bitrise.
                    </p>

                    {/* Interactive CI/CD Runner Preview */}
                    <div className="mt-5 rounded-2xl border border-border/70 bg-surface/70 p-3.5 font-mono text-[11px] shadow-sm">
                      <div className="flex items-center justify-between border-b border-border/50 pb-2 text-[10px]">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <GitBranch className="size-3 text-brand" /> .github/workflows/deploy.yml
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                          <Check className="size-3" /> passed in 14s
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-1.5 text-[10.5px]">
                        <div className="text-foreground/90 font-medium truncate">
                          $ npx fireota publish --rollout 25%
                        </div>
                        <div className="text-emerald-400 flex items-center gap-1.5">
                          <Check className="size-3 shrink-0" /> Hermes bytecode compiled (1.8 MB)
                        </div>
                        <div className="text-brand flex items-center gap-1.5">
                          <Check className="size-3 shrink-0" /> Uploaded to Firebase Storage
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-5 flex flex-wrap items-center gap-2 pt-2 border-t border-border/40"
                    aria-label="CI Providers"
                  >
                    {CI_TOOLS.map((tool) => (
                      <CiLogo key={tool} tool={tool} className="size-5" />
                    ))}
                    <Icons8Credit className="ml-auto text-[10px]" />
                  </div>
                </div>
              </Reveal>

              {/* Bento 6: Native SDK */}
              <Reveal delay={240}>
                <div className="group relative flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div>
                    <span className="grid size-11 place-items-center rounded-xl bg-emerald-500/12 text-emerald-400">
                      <Smartphone className="size-6" />
                    </span>
                    <h3 className="mt-5 font-display text-[20px] font-bold tracking-tight">
                      Lightweight Native SDK
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      Minimal footprint on Android & iOS. Downloads bundles in the background,
                      checks SHA-256 integrity, and swaps on next app launch seamlessly.
                    </p>

                    <div className="mt-5 rounded-2xl border border-border/70 bg-surface/70 p-3.5 font-mono text-[11px] space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Bundle Overhead:</span>
                        <span className="font-bold text-emerald-400">&lt; 35 KB</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cold Start Impact:</span>
                        <span className="font-bold text-emerald-400">0.0 ms (Async)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">SHA-256 Verification:</span>
                        <span className="font-semibold text-foreground">Hardware-Backed</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-2 font-mono text-[11px] text-muted-foreground">
                    <span>Runtime: Hermes &amp; JSC</span>
                    <span className="text-emerald-400 font-semibold">Zero Native Rebuilds</span>
                  </div>
                </div>
              </Reveal>

              {/* Bento 7: Full Audit Trail & Security */}
              <Reveal delay={280} className="sm:col-span-2 lg:col-span-1">
                <div className="group relative flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-background/80 p-6 sm:p-8 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_20px_60px_-20px_rgba(255,90,31,0.3)]">
                  <div>
                    <span className="grid size-11 place-items-center rounded-xl bg-amber-500/12 text-amber-400">
                      <History className="size-6" />
                    </span>
                    <h3 className="mt-5 font-display text-[20px] font-bold tracking-tight">
                      Full Audit Trail & Logs
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      Immutable event telemetry for every upload, rollout change, and rollback.
                      Real-time audit history of who shipped what and when.
                    </p>

                    <div className="mt-5 rounded-2xl border border-border/70 bg-surface/70 p-3.5 font-mono text-[11px] space-y-1.5 shadow-sm">
                      <div className="flex items-center justify-between text-[10px] text-faint border-b border-border/50 pb-1.5">
                        <span>AUDIT EVENT</span>
                        <span className="text-emerald-400 font-semibold">JUST NOW</span>
                      </div>
                      <div className="font-semibold text-foreground truncate pt-0.5">
                        release.staged_rollout → 50%
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between pt-1">
                        <span>actor: team-lead</span>
                        <span className="text-brand font-medium">production</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-2 font-mono text-[11px] text-muted-foreground">
                    <span>Retention: 365 Days</span>
                    <span className="text-amber-400 font-semibold">SOC2-Ready</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* INTERACTIVE ROLLOUT SIMULATOR                                             */}
        {/* ========================================================================= */}
        <section id="rollout" className="relative scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] items-center">
              <Reveal>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
                  Interactive Playground
                </span>
                <h2 className="mt-3 font-display text-[32px] font-bold tracking-tight sm:text-[44px]">
                  Staged rollouts you can feel in real time
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                  Drag the slider to preview how FireOTA distributes updates. Every device has a
                  permanent hash bucket for a release version: raising the percentage only ever adds
                  devices, so nobody flips back and forth.
                </p>

                <ul className="mt-6 space-y-3 text-[14px] text-muted-foreground">
                  {[
                    "Deterministic per-device FNV-1a buckets",
                    "Pause and resume at any percentage without losing state",
                    "Atomic 1-click rollback if any error spike occurs",
                    "Custom channel rules (Production, Staging, Internal Testers)",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <ShieldCheck className="size-4.5 text-brand shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex gap-3">
                  <Button size="lg" asChild>
                    <Link to="/signup">Try on your app free</Link>
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={120}>
                <RolloutSimulator />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* HOW IT WORKS (WORKFLOW STEPPER)                                           */}
        {/* ========================================================================= */}
        <section
          id="how"
          className="relative scroll-mt-20 border-t border-border/80 bg-surface/30 py-20 lg:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="text-center max-w-3xl mx-auto">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
                Developer Workflow
              </span>
              <h2 className="mt-3 font-display text-[32px] font-bold tracking-tight sm:text-[44px]">
                Four steps from commit to every phone
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                Get up and running in under five minutes with your standard React Native or Expo
                project.
              </p>
            </Reveal>

            <Reveal delay={120} className="mt-14 max-w-5xl mx-auto">
              <HowItWorks />
            </Reveal>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* WHY FIREOTA VS ALTERNATIVES                                               */}
        {/* ========================================================================= */}
        <section className="relative py-20 lg:py-24 border-t border-border/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center max-w-3xl mx-auto">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
                Direct Comparison
              </span>
              <h2 className="mt-3 font-display text-[30px] font-bold tracking-tight sm:text-[40px]">
                Why developers choose FireOTA
              </h2>
            </Reveal>

            <Reveal delay={100} className="mt-14">
              <ComparisonTable />
            </Reveal>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FAQ ACCORDION                                                            */}
        {/* ========================================================================= */}
        <section className="relative mx-auto max-w-4xl px-4 sm:px-6 py-20">
          <Reveal className="text-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
              Got Questions?
            </span>
            <h2 className="mt-3 font-display text-[32px] font-bold tracking-tight sm:text-[40px]">
              Frequently Asked Questions
            </h2>
          </Reveal>

          <Reveal delay={100} className="mt-10">
            <Accordion
              type="single"
              collapsible
              className="rounded-3xl border border-border/80 bg-surface/40 px-5 sm:px-8"
            >
              {FAQ.map(([q, a], idx) => (
                <AccordionItem
                  key={q}
                  value={q}
                  className={idx === FAQ.length - 1 ? "border-b-0" : ""}
                >
                  <AccordionTrigger className="text-[15px] font-display font-semibold hover:text-brand transition-colors text-left">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[14px] leading-relaxed text-muted-foreground pb-5">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </section>

        {/* ========================================================================= */}
        {/* BOTTOM HIGH-CONVERSION CTA BANNER                                        */}
        {/* ========================================================================= */}
        <section className="px-4 sm:px-6 pb-24">
          <Reveal>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl sm:rounded-2xl border border-brand/40 bg-gradient-to-br from-[#FF5A1F]/20 via-surface to-[#FFB21E]/15 p-8 sm:p-16 text-center shadow-2xl">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-3xl"
              />

              <BrandMark className="mx-auto size-16 drop-shadow-[0_10px_25px_rgba(255,90,31,0.5)]" />

              <h2 className="mt-6 font-display text-[32px] font-extrabold tracking-tight sm:text-[46px]">
                Your next React Native fix can be live today.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] sm:text-[16px] text-muted-foreground">
                Free at the platform level. Your Firebase, your files, your rules. Connect your
                project in less than 3 minutes.
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button
                  size="lg"
                  asChild
                  className="h-12 px-7 shadow-lg shadow-brand/30 text-[15px]"
                >
                  {user ? (
                    <Link to="/dashboard">Open Dashboard</Link>
                  ) : (
                    <Link to="/signup">Create Free Account</Link>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="h-12 px-6 border-border/80 bg-surface/60"
                >
                  <Link to="/docs">Read Documentation</Link>
                </Button>
              </div>

              <div className="mt-6 font-mono text-[11px] text-faint">
                npm install @fireota/react-native · No credit card required
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Modern Multi-Column Footer */}
      <footer className="border-t border-border/80 bg-surface/30 px-4 sm:px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark className="size-7" />
                <span className="font-display text-[18px] font-bold">FireOTA</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Firebase-native OTA release management for modern React Native and Expo
                applications.
              </p>
              <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-faint">
                <span className="size-2 rounded-full bg-emerald-400" />
                <span>All systems operational</span>
              </div>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-foreground font-semibold">
                Product
              </h4>
              <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
                <li>
                  <a href="#overview" className="hover:text-foreground">
                    Overview
                  </a>
                </li>
                <li>
                  <a href="#architecture" className="hover:text-foreground">
                    Private Architecture
                  </a>
                </li>
                <li>
                  <a href="#rollout" className="hover:text-foreground">
                    Rollout Simulator
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-foreground">
                    Channels & Rollbacks
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-foreground font-semibold">
                Developers
              </h4>
              <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
                <li>
                  <Link to="/docs" className="hover:text-foreground">
                    Documentation
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/Sujay-Dynamisch/FireOTA"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground flex items-center gap-1"
                  >
                    GitHub SDK <ExternalLink className="size-3" />
                  </a>
                </li>
                <li>
                  <Link to="/changelog" className="hover:text-foreground">
                    Changelog
                  </Link>
                </li>
                <li>
                  <a
                    href="https://www.npmjs.com/package/@fireota/react-native"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground flex items-center gap-1"
                  >
                    npm Package <ExternalLink className="size-3" />
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-foreground font-semibold">
                Legal & Trust
              </h4>
              <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
                <li>
                  <Link to="/privacy" className="hover:text-foreground">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-foreground">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/security" className="hover:text-foreground">
                    Security Disclosure
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-border/50 pt-6 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] text-faint">
            <div>
              © {new Date().getFullYear()} FireOTA. Built for React Native & Expo developers.
            </div>
            <div>Storage hosted strictly on your own Google Cloud Firebase tenant.</div>
          </div>
        </div>
      </footer>

      {/* Full-Resolution Architecture Diagram Lightbox Modal */}
      {archModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setArchModalOpen(false)}
        >
          <div
            className="relative max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-border/80 bg-neutral-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/80 bg-surface px-4 py-3 text-foreground">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-red-500" />
                <span className="size-2.5 rounded-full bg-amber-500" />
                <span className="size-2.5 rounded-full bg-emerald-500" />
                <span className="ml-2 font-mono text-[11px] font-semibold text-foreground">
                  FireOTA System Architecture Blueprint (Full Resolution)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setArchModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="max-h-[85vh] overflow-auto p-4 bg-white flex justify-center items-center">
              <img
                src="/media/fireota-system-architecture.png"
                alt="FireOTA Official System Architecture Diagram Full Size"
                className="w-full max-h-[80vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rollout Simulator with deterministic bucket hashing */
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
  const [pct, setPct] = useState(25);
  const [paused, setPaused] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const buckets = useMemo(
    () => Array.from({ length: DEVICE_COUNT }, (_, i) => bucket(`device-${i}:1.4.0`)),
    [],
  );
  const effective = rolledBack ? 0 : pct;
  const updated = buckets.filter((b) => b < effective).length;

  return (
    <div className="rounded-3xl sm:rounded-2xl border border-border/80 bg-background/90 p-6 sm:p-8 shadow-[0_30px_90px_-40px_rgba(255,90,31,0.5)] backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-3.5 text-brand animate-pulse" />
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              channel: production · target: android + ios
            </p>
          </div>
          <p className="mt-1 font-display text-[18px] font-bold">
            Release 1.4.0{" "}
            <span
              className={cn(
                "ml-1.5 rounded-full px-2.5 py-0.5 align-middle font-mono text-[11px] font-medium",
                rolledBack
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : paused
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
              )}
            >
              {rolledBack ? "rolled back" : paused ? "paused" : "rolling out"}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-[36px] font-extrabold text-brand leading-none">
            {effective}%
          </p>
          <span className="font-mono text-[10px] text-faint">target audience</span>
        </div>
      </div>

      {/* Device Mesh Grid */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2 font-mono text-[11px] text-faint">
          <span>Deterministic Device Hash Mesh (60 sample phones)</span>
          <span className="text-foreground">{updated} updated</span>
        </div>
        <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
          {buckets.map((b, i) => {
            const on = b < effective;
            return (
              <span
                key={i}
                title={`Device #${i} — Hash bucket ${b}% (${on ? "Updated" : "Waiting"})`}
                className={cn(
                  "grid aspect-[4/5] place-items-center rounded-lg border transition-all duration-300",
                  on
                    ? "scale-105 border-brand bg-brand/25 text-brand shadow-[0_0_14px_rgba(255,90,31,0.4)]"
                    : "border-border/60 bg-surface/40 text-faint hover:border-border",
                )}
              >
                <Smartphone className="size-3.5 sm:size-4" />
              </span>
            );
          })}
        </div>
      </div>

      {/* Slider Controls */}
      <div className="mt-6 pt-4 border-t border-border/60">
        <Slider
          value={[pct]}
          min={0}
          max={100}
          step={1}
          disabled={paused || rolledBack}
          onValueChange={(v) => setPct(v[0] ?? 0)}
          aria-label="Rollout percentage"
        />
        <div className="mt-2.5 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>0%</span>
          <span className="text-foreground font-semibold">
            {updated} of {DEVICE_COUNT} devices receiving 1.4.0
          </span>
          <span>100%</span>
        </div>
      </div>

      {/* Preset Notches and Actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {[10, 25, 50, 100].map((p) => (
          <Button
            key={p}
            size="sm"
            variant={pct === p && !rolledBack ? "default" : "outline"}
            disabled={paused || rolledBack}
            onClick={() => setPct(p)}
            className="font-mono text-[12px]"
          >
            {p}%
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={rolledBack}
          onClick={() => setPaused((x) => !x)}
          className="ml-auto font-mono text-[12px]"
        >
          {paused ? (
            <Play className="size-3.5 text-emerald-400" />
          ) : (
            <Pause className="size-3.5 text-amber-400" />
          )}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRolledBack((x) => !x);
            setPaused(false);
          }}
          className={cn("font-mono text-[12px]", rolledBack ? "text-emerald-400" : "text-red-400")}
        >
          <RotateCcw className="size-3.5" />
          {rolledBack ? "Re-publish 1.4.0" : "Instant Rollback"}
        </Button>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Connect Firebase",
    copy: "Authenticate with Google and select your Firebase project. Releases and source maps stream directly to your Firebase Storage bucket.",
    code: "# Step 1: In your FireOTA dashboard\nProjects → Connect Firebase → Select your Google Cloud Project",
  },
  {
    title: "Install the SDK",
    copy: "Drop the lightweight React Native SDK into your app. It verifies updates on launch and applies them smoothly on restart.",
    code: "npm install @fireota/react-native\n# or with bun / pnpm\nbun add @fireota/react-native\ncd ios && pod install",
  },
  {
    title: "Publish a Release",
    copy: "Bundle and upload from your local terminal or CI/CD with the FireOTA CLI. Zero cloud compilation fees.",
    code: "npx fireota publish \\\n  --app YOUR_APP_ID \\\n  --platform android \\\n  --version 1.4.0 \\\n  --runtime 1.4.0 \\\n  --rollout 10",
  },
  {
    title: "Roll Out & Monitor",
    copy: "Increase the staged rollout percentage, watch adoption telemetry, pause anytime, or trigger an instant rollback.",
    code: "npx fireota release rollout RELEASE_ID --percentage 50\n# Instant rollback if needed:\nnpx fireota release rollback RELEASE_ID",
  },
];

function HowItWorks() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 5000);
    return () => clearInterval(t);
  }, [auto]);

  const step = STEPS[active]!;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] items-center">
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setAuto(false);
              }}
              className={cn(
                "relative w-full overflow-hidden rounded-2xl sm:rounded-3xl border p-5 text-left transition-all duration-300",
                i === active
                  ? "border-brand bg-brand/10 shadow-lg shadow-brand/10"
                  : "border-border/70 bg-surface/40 hover:border-brand/40 hover:bg-surface/70",
              )}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl font-mono text-[12px] font-bold transition-colors",
                    i === active
                      ? "bg-brand text-white shadow-md shadow-brand/30"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="font-display text-[16px] font-bold">{s.title}</span>
              </div>
              {i === active && (
                <p className="mt-2.5 block pl-11 text-[13px] leading-relaxed text-muted-foreground">
                  {s.copy}
                </p>
              )}
              {i === active && auto && (
                <span
                  key={active}
                  className="absolute bottom-0 left-0 h-0.5 bg-brand"
                  style={{ animation: "fireota-progress 5s linear forwards" }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>

      <div>
        <div key={active} className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-faint">
            <span>
              STEP {active + 1} OF 4 · {step.title.toUpperCase()}
            </span>
            <span className="text-brand font-medium">Ready for terminal</span>
          </div>
          <CodeBlock code={step.code} language="bash" />
        </div>
      </div>
      <style>{`@keyframes fireota-progress{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}

const FAQ: [string, string][] = [
  [
    "Is FireOTA really free at the platform level?",
    "Yes, FireOTA charges $0 for platform usage. Your releases, assets, and source maps are stored directly inside your own Google Firebase Storage bucket, so you only use your own Google Cloud plan (which is typically within the free tier for small-to-medium mobile apps).",
  ],
  [
    "Does FireOTA have access to or hold my JavaScript bundles?",
    "No. In FireOTA's sovereign architecture, bundle files and assets stream directly from your build environment into your Firebase Storage bucket. FireOTA servers only process release manifest metadata and bucketing logic. We never retain your proprietary source code.",
  ],
  [
    "How does FireOTA compare to Microsoft CodePush and Expo Updates?",
    "CodePush has been retired by Microsoft and required third-party cloud hosting. Expo Updates requires EAS infrastructure. FireOTA gives you total data sovereignty with private Firebase storage, open-source SDKs, deterministic staged rollouts, and zero platform subscriptions.",
  ],
  [
    "Is OTA compliant with Apple App Store & Google Play guidelines?",
    "Yes. Both Apple (Section 3.3.2 of the Developer Program License) and Google Play permit over-the-air updates for interpreted JavaScript and asset files, provided the update does not fundamentally alter the application's primary purpose. Native code changes still require app store submission.",
  ],
  [
    "What is deterministic bucket hashing and why does it matter?",
    "Many legacy OTA tools roll dice on every check, causing devices to randomly oscillate between versions. FireOTA hashes each device ID using stable FNV-1a algorithms. If a phone is in the 15% bucket, it stays in that bucket for release 1.4.0 — increasing the rollout strictly adds new devices without flipping existing users back and forth.",
  ],
  [
    "Can I integrate FireOTA into my GitHub Actions or CI pipeline?",
    "Yes. FireOTA provides a standalone CLI that runs seamlessly in any CI runner with a simple 'npx fireota publish' command using scoped API keys.",
  ],
];
