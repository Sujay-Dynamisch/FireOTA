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

const CALLOUTS = {
  note: { icon: "info", label: "Note", box: "border-info/30 bg-info/10", text: "text-info" },
  tip: { icon: "lightbulb", label: "Tip", box: "border-success/30 bg-success/10", text: "text-success" },
  caution: { icon: "error", label: "Caution", box: "border-danger/30 bg-danger/10", text: "text-danger" },
  important: { icon: "warning", label: "Important", box: "border-warning/30 bg-warning/10", text: "text-warning" },
} as const;

export function Callout({ kind = "note", children }: { kind?: keyof typeof CALLOUTS; children: ReactNode }) {
  const c = CALLOUTS[kind];
  return (
    <div className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-[13px] leading-relaxed", c.box)}>
      <MIcon name={c.icon} filled className={cn("mt-0.5 text-[20px]", c.text)} />
      <div className="min-w-0 text-foreground/90">
        <strong className={cn("font-semibold", c.text)}>{c.label}: </strong>
        {children}
      </div>
    </div>
  );
}

export function Code({ code, language = "bash" }: { code: string; language?: string }) {
  return <CodeBlock code={code} language={language} />;
}

export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-foreground">{children}</code>;
}

/** Numbered steps with a vertical rail, like the Firebase guides. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[11px] text-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">{item}</div>
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
