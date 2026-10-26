/**
 * Docs home: Expo-style card grid — quick start, tutorials, CLI terminals and "discover more".
 * Light gradients with matching dark-mode variants; every card links to a real docs page.
 */
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { MIcon } from "@/components/docs/docs-ui";
import { ProductVideo } from "@/components/fireota/product-video";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/Sujay-Dynamisch/FireOTA";

/** Dark terminal block with a copy button, like Expo's quick start. */
function Terminal({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl bg-[#0B0C0E] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/10">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#1E1F23] px-4 py-2.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <MIcon name="terminal" className="text-[18px] text-white/80" /> Terminal
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex items-center gap-1 text-[12px] text-white/70 transition-colors hover:text-white"
          aria-label="Copy commands"
        >
          <MIcon name={copied ? "check" : "content_copy"} className="text-[16px]" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6 text-white">
        {lines.map((line) => {
          const [cmd, ...rest] = line.split(" ");
          return (
            <div key={line} className="whitespace-pre-wrap break-words">
              <span className="text-white/40">- </span>
              <span className="text-[#FF4FA3]">{cmd}</span> {rest.join(" ")}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

const tones = {
  brand: {
    card: "from-orange-50 via-white to-amber-50 border-orange-200/70 dark:from-orange-500/10 dark:via-transparent dark:to-amber-500/5 dark:border-orange-500/20",
    title: "text-orange-700 dark:text-orange-300",
    button: "bg-[#E8590C] hover:bg-[#D14E08]",
    soft: "text-orange-300/40 dark:text-orange-400/10",
  },
  blue: {
    card: "from-sky-50 via-blue-50 to-sky-100/60 border-sky-200/80 dark:from-sky-500/10 dark:via-transparent dark:to-blue-500/10 dark:border-sky-500/20",
    title: "text-sky-900 dark:text-sky-200",
    button: "bg-[#0A6FD8] hover:bg-[#085FBA]",
    soft: "text-sky-300/50 dark:text-sky-400/10",
  },
  violet: {
    card: "from-violet-50 via-white to-fuchsia-50 border-violet-200/70 dark:from-violet-500/10 dark:via-transparent dark:to-fuchsia-500/5 dark:border-violet-500/20",
    title: "text-violet-700 dark:text-violet-300",
    button: "bg-[#7C3AED] hover:bg-[#6D28D9]",
    soft: "text-violet-300/40 dark:text-violet-400/10",
  },
  green: {
    card: "from-emerald-50 via-green-50 to-emerald-100/50 border-emerald-200/80 dark:from-emerald-500/10 dark:via-transparent dark:to-green-500/10 dark:border-emerald-500/20",
    title: "text-emerald-900 dark:text-emerald-200",
    button: "bg-[#1E7F4F] hover:bg-[#186B42]",
    soft: "text-emerald-300/50 dark:text-emerald-400/10",
  },
  pink: {
    card: "from-pink-50 via-white to-rose-50 border-pink-200/70 dark:from-pink-500/10 dark:via-transparent dark:to-rose-500/5 dark:border-pink-500/20",
    title: "text-pink-700 dark:text-pink-300",
    button: "bg-[#D63384] hover:bg-[#BE2A73]",
    soft: "text-pink-300/40 dark:text-pink-400/10",
  },
  orange: {
    card: "from-orange-50 via-white to-orange-100/60 border-orange-200/70 dark:from-orange-500/10 dark:via-transparent dark:to-orange-500/5 dark:border-orange-500/20",
    title: "text-orange-700 dark:text-orange-300",
    button: "bg-[#D9480F] hover:bg-[#C03F0C]",
    soft: "text-orange-300/40 dark:text-orange-400/10",
  },
} as const;

type Tone = keyof typeof tones;

/** Expo-style background textures: an SVG tile used as a mask over the tone colour, faded out. */
const svgTile = (body: string, w: number, h: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

const PATTERNS = {
  // Offset rows of rounded blocks, strongest at the bottom (Quick Start card).
  bricks: {
    tile: svgTile(
      "<rect x='0' y='0' width='24' height='9' rx='2'/><rect x='28' y='0' width='24' height='9' rx='2'/><rect x='-14' y='13' width='24' height='9' rx='2'/><rect x='14' y='13' width='24' height='9' rx='2'/><rect x='42' y='13' width='24' height='9' rx='2'/>",
      56,
      26,
    ),
    size: "56px 26px",
    fade: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 40%, transparent 85%)",
  },
  // Fine diagonal hatch (tutorial and CI cards).
  hatch: {
    tile: svgTile("<path d='M-2 2l4-4M0 10l10-10M8 12l4-4' stroke='black' stroke-width='1.2'/>", 10, 10),
    size: "10px 10px",
    fade: "linear-gradient(to bottom left, #000 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.25) 100%)",
  },
  // Soft dot grid (smaller "discover" cards).
  dots: {
    tile: svgTile("<circle cx='2' cy='2' r='1.4'/>", 14, 14),
    size: "14px 14px",
    fade: "radial-gradient(120% 120% at 100% 100%, #000 0%, rgba(0,0,0,0.5) 45%, transparent 80%)",
  },
} as const;

type Pattern = keyof typeof PATTERNS;

const patternInk: Record<Tone, string> = {
  brand: "text-zinc-900/[0.07] dark:text-white/[0.06]",
  blue: "text-sky-700/[0.13] dark:text-sky-300/[0.10]",
  violet: "text-violet-700/[0.09] dark:text-violet-300/[0.08]",
  green: "text-emerald-700/[0.13] dark:text-emerald-300/[0.10]",
  pink: "text-pink-700/[0.10] dark:text-pink-300/[0.08]",
  orange: "text-orange-700/[0.10] dark:text-orange-300/[0.08]",
};

const defaultPattern: Record<Tone, Pattern | null> = {
  brand: "bricks",
  blue: "hatch",
  green: "hatch",
  violet: null,
  pink: "dots",
  orange: "dots",
};

function Texture({ pattern, tone }: { pattern: Pattern; tone: Tone }) {
  const p = PATTERNS[pattern];
  const mask = `${p.tile}, ${p.fade}`;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10", patternInk[tone])}
      style={{
        backgroundColor: "currentColor",
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: `${p.size}, 100% 100%`,
        WebkitMaskSize: `${p.size}, 100% 100%`,
        maskRepeat: "repeat, no-repeat",
        WebkitMaskRepeat: "repeat, no-repeat",
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    />
  );
}

function Card({
  tone,
  pattern,
  className,
  children,
}: {
  tone: Tone;
  /** Background texture; defaults per tone, `null` for none. */
  pattern?: Pattern | null;
  className?: string;
  children: ReactNode;
}) {
  const texture = pattern === undefined ? defaultPattern[tone] : pattern;
  return (
    <div
      className={cn(
        "group relative isolate overflow-hidden rounded-4xl border bg-gradient-to-br p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] sm:p-7",
        tones[tone].card,
        className,
      )}
    >
      {texture ? <Texture pattern={texture} tone={tone} /> : null}
      {children}
    </div>
  );
}

function Pill({
  tone,
  to,
  href,
  onClick,
  children,
}: {
  tone: Tone;
  to?: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = cn(
    "relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors",
    tones[tone].button,
  );
  if (to) {
    return (
      <Link to="/docs/$slug" params={{ slug: to }} className={className}>
        {children}{" "}
        <MIcon
          name="arrow_forward"
          className="text-[18px] transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children} <MIcon name="north_east" className="text-[18px]" />
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children} <MIcon name="play_arrow" className="text-[18px]" />
    </button>
  );
}

/** Three phones receiving an update — pure CSS, no images. */
function PhonesArt() {
  const phone = (rotate: string, delay: string) => (
    <div
      className={cn(
        "relative h-[150px] w-[78px] rounded-[18px] bg-[#1C1F26] p-[5px] shadow-xl",
        rotate,
      )}
    >
      <div className="flex h-full flex-col gap-1.5 overflow-hidden rounded-[14px] bg-gradient-to-b from-sky-300 to-blue-500 p-2">
        <div className="h-9 rounded-md bg-white/90" />
        <div className="h-1.5 w-3/4 rounded bg-white/70" />
        <div className="h-1.5 w-1/2 rounded bg-white/70" />
        <div className="mt-auto grid h-6 place-items-center rounded-md bg-white/95">
          <span className="animate-pulse" style={{ animationDelay: delay }}>
            <MIcon name="system_update" className="text-[14px] text-blue-600" />
          </span>
        </div>
      </div>
    </div>
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-6 right-2 hidden items-end gap-2 sm:flex lg:right-4 lg:gap-3"
    >
      {phone("-rotate-[10deg] translate-y-3", "0ms")}
      {phone("", "300ms")}
      {phone("rotate-[10deg] translate-y-3", "600ms")}
    </div>
  );
}

/** A CI run with green checks — pure CSS. */
function PipelineArt() {
  const row = (state: "done" | "running", width: string) => (
    <div className="flex items-center gap-3">
      {state === "done" ? (
        <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-white">
          <MIcon name="check" className="text-[13px]" />
        </span>
      ) : (
        <span className="size-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      )}
      <span className="space-y-1">
        <span className={cn("block h-2 rounded bg-white/25", width)} />
        <span className="block h-1.5 w-16 rounded bg-white/10" />
      </span>
    </div>
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-8 -right-4 hidden w-[240px] rotate-[-8deg] rounded-xl bg-[#1C1F26] p-4 shadow-2xl sm:right-2 sm:block"
    >
      <div className="mb-3 flex gap-1.5">
        <span className="size-2 rounded-full bg-white/30" />
        <span className="size-2 rounded-full bg-white/30" />
        <span className="ml-2 h-2 w-24 rounded bg-white/15" />
      </div>
      <div className="space-y-3">
        {row("done", "w-32")}
        {row("done", "w-28")}
        {row("running", "w-24")}
      </div>
    </div>
  );
}

function Badge({ icon, tone }: { icon: string; tone: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-6 right-6 grid size-16 place-items-center rounded-2xl border-4 border-white/60 shadow-sm dark:border-white/10",
        tone,
      )}
    >
      <MIcon name={icon} className="text-[30px]" />
    </span>
  );
}

function SectionTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-[20px] font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">{text}</p>
    </div>
  );
}

export function DocsHomeCards() {
  const [demo, setDemo] = useState(false);
  return (
    <div className="space-y-12">
      {/* Hero grid */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card tone="brand" className="from-white via-white to-orange-50/60">
          <h2 className="flex items-center gap-2 text-[22px] font-bold tracking-tight">
            <MIcon name="bolt" className="text-[28px] text-amber-500" /> Quick Start
          </h2>
          <div className="mt-5">
            <Terminal
              lines={["npm install @fireota/react-native @fireota/cli", "npx fireota init"]}
            />
          </div>
          <p className="mt-4 text-[14px] text-muted-foreground">
            Then continue with the{" "}
            <Link
              to="/docs/$slug"
              params={{ slug: "quickstart" }}
              className="font-medium text-sky-700 hover:underline dark:text-sky-400"
            >
              step-by-step quickstart
            </Link>
            .
          </p>
        </Card>

        <Card tone="blue" className="sm:min-h-[260px]">
          <h2
            className={cn(
              "max-w-[15rem] text-[22px] font-bold leading-snug tracking-tight",
              tones.blue.title,
            )}
          >
            Ship your first over-the-air update
          </h2>
          <div className="mt-6 sm:mt-28">
            <Pill tone="blue" to="quickstart">
              Start tutorial
            </Pill>
          </div>
          <PhonesArt />
        </Card>

        <Card tone="violet" className="sm:min-h-[240px]">
          <h2 className="flex items-center gap-3 text-[20px] font-bold tracking-tight">
            <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow">
              <MIcon name="smart_display" className="text-[24px]" />
            </span>
            Watch the 4-minute demo
          </h2>
          <p className="relative z-10 mt-4 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
            See a release go from upload to every phone: connect Firebase, add an app, publish, roll
            out and roll back.
          </p>
          <div className="mt-6">
            <Pill tone="violet" onClick={() => setDemo(true)}>
              Play demo
            </Pill>
          </div>
          <MIcon
            name="rocket_launch"
            className={cn(
              "pointer-events-none absolute -bottom-20 -right-14 -z-10 rotate-12 text-[300px] leading-none text-sky-300/25 dark:text-violet-400/10",
            )}
          />
        </Card>

        <Card tone="green" className="sm:min-h-[240px]">
          <h2
            className={cn(
              "max-w-[17rem] text-[22px] font-bold leading-snug tracking-tight",
              tones.green.title,
            )}
          >
            Automate releases from any CI pipeline
          </h2>
          <div className="mt-6 sm:mt-20">
            <Pill tone="green" to="ci">
              Start CI/CD guide
            </Pill>
          </div>
          <PipelineArt />
        </Card>
      </div>

      {/* Terminals */}
      <section>
        <SectionTitle
          title="Publish from the CLI"
          text="Ship and control updates straight from your terminal or pipeline."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Card tone="violet">
            <h3 className={cn("flex items-center gap-2 text-[17px] font-bold", tones.violet.title)}>
              <MIcon name="cloud_upload" className="text-[22px]" /> Publish an update
            </h3>
            <div className="relative z-10 mt-4">
              <Terminal lines={['npx fireota publish --platform all --message "Fix login bug"']} />
            </div>
            <p className="relative z-10 mt-3 text-[13px] text-muted-foreground">
              Bundles, uploads to your Firebase Storage and publishes. See{" "}
              <Link
                to="/docs/$slug"
                params={{ slug: "publish" }}
                className="text-sky-700 hover:underline dark:text-sky-400"
              >
                Publish an update
              </Link>
              .
            </p>
            <MIcon
              name="favorite"
              className={cn(
                "pointer-events-none absolute -right-6 -top-6 text-[140px]",
                tones.violet.soft,
              )}
            />
          </Card>
          <Card tone="green">
            <h3 className={cn("flex items-center gap-2 text-[17px] font-bold", tones.green.title)}>
              <MIcon name="undo" className="text-[22px]" /> Roll back instantly
            </h3>
            <div className="relative z-10 mt-4">
              <Terminal
                lines={['npx fireota release rollback <releaseId> --reason "Crash on launch"']}
              />
            </div>
            <p className="relative z-10 mt-3 text-[13px] text-muted-foreground">
              Phones return to the previous update on their next check. See{" "}
              <Link
                to="/docs/$slug"
                params={{ slug: "rollouts" }}
                className="text-sky-700 hover:underline dark:text-sky-400"
              >
                rollouts and rollback
              </Link>
              .
            </p>
            <MIcon
              name="cloud"
              className={cn(
                "pointer-events-none absolute -right-8 -top-8 text-[160px]",
                tones.green.soft,
              )}
            />
          </Card>
        </div>
      </section>

      {/* Discover more */}
      <section>
        <SectionTitle
          title="Discover more"
          text="Get the most out of FireOTA once your first update is live."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Card tone="green" className="min-h-[170px]">
            <h3
              className={cn("max-w-[16rem] text-[17px] font-bold leading-snug", tones.green.title)}
            >
              Prove every update is yours with code signing
            </h3>
            <div className="mt-5">
              <Pill tone="green" to="code-signing">
                Set up signing
              </Pill>
            </div>
            <Badge
              icon="verified_user"
              tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
            />
          </Card>
          <Card tone="pink" className="min-h-[170px]">
            <h3
              className={cn("max-w-[16rem] text-[17px] font-bold leading-snug", tones.pink.title)}
            >
              Roll out safely with staged percentages
            </h3>
            <div className="mt-5">
              <Pill tone="pink" to="rollouts">
                Get started
              </Pill>
            </div>
            <Badge
              icon="donut_large"
              tone="bg-pink-100 text-pink-500 dark:bg-pink-500/15 dark:text-pink-300"
            />
          </Card>
          <Card tone="orange" className="min-h-[170px]">
            <h3 className={cn("text-[17px] font-bold", tones.orange.title)}>
              Let AI agents ship for you
            </h3>
            <p className="relative z-10 mt-2 max-w-[15rem] text-[13px] text-orange-800/80 dark:text-orange-200/70">
              Bring your own Claude or OpenAI key — agents deploy, review and watch for threats.
            </p>
            <div className="mt-4">
              <Pill tone="orange" to="agents">
                Meet the agents
              </Pill>
            </div>
            <Badge
              icon="smart_toy"
              tone="bg-orange-100 text-orange-500 dark:bg-orange-500/15 dark:text-orange-300"
            />
          </Card>
          <Card tone="blue" className="min-h-[170px]">
            <h3 className={cn("text-[17px] font-bold", tones.blue.title)}>Join us on GitHub</h3>
            <p className="relative z-10 mt-2 max-w-[15rem] text-[13px] text-sky-800/80 dark:text-sky-200/70">
              Report issues, request features and follow every release of the SDK and CLI.
            </p>
            <div className="mt-4">
              <Pill tone="blue" href={GITHUB}>
                Go to GitHub
              </Pill>
            </div>
            <Badge
              icon="forum"
              tone="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
            />
          </Card>
        </div>
      </section>

      <Dialog open={demo} onOpenChange={setDemo}>
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">FireOTA product walkthrough</DialogTitle>
          {demo ? <ProductVideo /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
