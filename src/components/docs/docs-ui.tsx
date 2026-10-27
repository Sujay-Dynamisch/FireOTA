import type { ReactNode } from "react";

import { CodeBlock } from "@/components/fireota/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Google Material Symbols (Outlined). The font is loaded by the /docs layout. */
export function MIcon({ name, className, filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    // Size/colour/position classes go on the wrapper: Google's icon CSS fixes font-size at 24px
    // and outranks Tailwind utilities, so the glyph inherits the size from here instead.
    <span aria-hidden className={cn("select-none leading-none", className)}>
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: "inherit",
          lineHeight: "inherit",
          fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20`,
        }}
      >
        {name}
      </span>
    </span>
  );
}

/** "New" / "Updated" pill for pages and sections added in the latest release. */
export function NewBadge({ label = "New", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-brand px-1.5 font-sans text-[9.5px] font-semibold uppercase leading-[16px] tracking-wide text-white",
        label !== "New" && "bg-brand/15 text-brand",
        className,
      )}
    >
      {label}
    </span>
  );
}

const CALLOUTS = {
  note: { icon: "info", label: "Note", box: "border-info/25 bg-info/[0.06]", bar: "bg-info", text: "text-info" },
  tip: { icon: "lightbulb", label: "Tip", box: "border-success/25 bg-success/[0.06]", bar: "bg-success", text: "text-success" },
  caution: { icon: "error", label: "Caution", box: "border-danger/25 bg-danger/[0.06]", bar: "bg-danger", text: "text-danger" },
  important: { icon: "warning", label: "Important", box: "border-warning/25 bg-warning/[0.06]", bar: "bg-warning", text: "text-warning" },
} as const;

export function Callout({ kind = "note", children }: { kind?: keyof typeof CALLOUTS; children: ReactNode }) {
  const c = CALLOUTS[kind];
  return (
    <div className={cn("relative flex gap-3 overflow-hidden rounded-xl border py-3.5 pl-5 pr-4 text-[13.5px] leading-relaxed", c.box)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", c.bar)} />
      <MIcon name={c.icon} filled className={cn("mt-0.5 text-[20px]", c.text)} />
      <div className="min-w-0 text-foreground/90">
        <strong className={cn("font-semibold", c.text)}>{c.label}: </strong>
        {children}
      </div>
    </div>
  );
}

/** Real device screenshots side by side, in a phone bezel (e.g. before / after an update). */
export function PhoneShots({ shots }: { shots: { src: string; alt: string; label: ReactNode }[] }) {
  return (
    <div className="grid gap-6 rounded-2xl border border-border bg-gradient-to-b from-surface-2 to-transparent px-4 py-6 sm:grid-cols-2">
      {shots.map((shot) => (
        <figure key={shot.src} className="space-y-3 text-center">
          <div className="mx-auto w-[190px] overflow-hidden rounded-[30px] border-[7px] border-neutral-900 bg-white shadow-xl ring-1 ring-border">
            <img src={shot.src} alt={shot.alt} loading="lazy" width={360} height={800} className="block w-full" />
          </div>
          <figcaption className="mx-auto max-w-[240px] text-[12px] leading-snug text-muted-foreground">{shot.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Two-column reference table (field → meaning), scrolls sideways on phones. */
export function FieldTable({ head = ["Field", "What it does"], rows }: { head?: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[480px] text-left text-[13px]">
        <thead className="bg-surface-2/70 text-[11px] uppercase tracking-wider text-faint">
          <tr>
            <th className="px-4 py-2.5 font-semibold">{head[0]}</th>
            <th className="px-4 py-2.5 font-semibold">{head[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([key, value], i) => (
            <tr key={i} className="align-top">
              <td className="whitespace-nowrap px-4 py-2.5 font-medium text-foreground">{key}</td>
              <td className="px-4 py-2.5 text-foreground/85">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Code({ code, language = "bash" }: { code: string; language?: string }) {
  return <CodeBlock code={code} language={language} />;
}

export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-foreground">{children}</code>;
}

/** Numbered steps joined by a vertical rail, like the Expo and Firebase guides. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-5">
      {items.map((item, i) => (
        <li key={i} className="relative flex gap-4">
          {i < items.length - 1 ? <span aria-hidden className="absolute bottom-[-20px] left-[13px] top-8 w-px bg-border" /> : null}
          <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 font-mono text-[12px] font-semibold text-brand ring-4 ring-background">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2.5 pt-1">{item}</div>
        </li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-faint">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Pill tabs (e.g. Android / iOS), like the APK / AAB switch in the Firebase docs. */
export function PlatformTabs({ tabs }: { tabs: { value: string; label: string; icon?: string; content: ReactNode }[] }) {
  return (
    <Tabs defaultValue={tabs[0]?.value} className="space-y-4">
      <TabsList className="h-auto gap-2 bg-transparent p-0">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="gap-1.5 rounded-full border border-border px-4 py-1.5 text-[12px] data-[state=active]:border-brand data-[state=active]:bg-brand data-[state=active]:text-white"
          >
            {t.icon ? <MIcon name={t.icon} className="text-[16px]" /> : null}
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-0 space-y-3">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
      {children}
    </a>
  );
}
