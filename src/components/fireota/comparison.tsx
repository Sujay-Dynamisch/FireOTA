/**
 * Landing-page comparison: FireOTA against legacy CodePush and hosted OTA services.
 * Desktop: a 4-column grid with the FireOTA column raised as a highlighted card.
 * Phones: one card per feature, FireOTA first.
 */
import {
  Bot,
  Check,
  Cloud,
  Code2,
  Layers,
  Minus,
  ShieldCheck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { BrandMark } from "@/components/fireota/brand-mark";
import { cn } from "@/lib/utils";

type Tone = "yes" | "partial" | "no";

interface Cell {
  label: string;
  detail?: string;
  tone: Tone;
}

interface Row {
  feature: string;
  icon: LucideIcon;
  fireota: Cell;
  codepush: Cell;
  clouds: Cell;
}

const ROWS: Row[] = [
  {
    feature: "Code ownership",
    icon: ShieldCheck,
    fireota: {
      label: "Your Firebase project",
      detail: "Bundles never leave your storage",
      tone: "yes",
    },
    codepush: { label: "Microsoft servers", detail: "Service retired", tone: "no" },
    clouds: { label: "Vendor's cloud", detail: "Third-party storage", tone: "partial" },
  },
  {
    feature: "Platform fee",
    icon: Wallet,
    fireota: { label: "$0, forever", detail: "Pay Google only for storage", tone: "yes" },
    codepush: { label: "Shut down", detail: "No longer supported", tone: "no" },
    clouds: { label: "$99 – $500+ / mo", detail: "Plus bandwidth", tone: "no" },
  },
  {
    feature: "Staged rollouts",
    icon: Layers,
    fireota: {
      label: "Stable per-device buckets",
      detail: "Deterministic FNV-1a hashing",
      tone: "yes",
    },
    codepush: { label: "Random per check", detail: "Devices flip in and out", tone: "partial" },
    clouds: { label: "Depends on plan", tone: "partial" },
  },
  {
    feature: "Open-source SDK",
    icon: Code2,
    fireota: { label: "MIT licensed", detail: "SDK and CLI on GitHub", tone: "yes" },
    codepush: { label: "Archived", tone: "no" },
    clouds: { label: "Closed source", tone: "no" },
  },
  {
    feature: "Expo support",
    icon: Cloud,
    fireota: { label: "Config plugin", detail: "Prebuild, EAS Build, expo-router", tone: "yes" },
    codepush: { label: "Bare React Native only", tone: "no" },
    clouds: { label: "Varies by vendor", tone: "partial" },
  },
  {
    feature: "AI monitoring",
    icon: Bot,
    fireota: { label: "Permissioned agents", detail: "Risky actions need approval", tone: "yes" },
    codepush: { label: "None", tone: "no" },
    clouds: { label: "Rule-based alerts", tone: "partial" },
  },
];

const TONE: Record<Tone, { icon: LucideIcon; className: string; srLabel: string }> = {
  yes: { icon: Check, className: "bg-emerald-500/15 text-emerald-500", srLabel: "Yes" },
  partial: { icon: Minus, className: "bg-amber-500/15 text-amber-500", srLabel: "Partly" },
  no: { icon: X, className: "bg-rose-500/12 text-rose-500/80", srLabel: "No" },
};

function Value({ cell, strong = false }: { cell: Cell; strong?: boolean }) {
  const tone = TONE[cell.tone];
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
          tone.className,
        )}
      >
        <tone.icon className="size-3" strokeWidth={3} aria-hidden />
        <span className="sr-only">{tone.srLabel}</span>
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-[13.5px] leading-snug",
            strong ? "font-semibold text-foreground" : "text-foreground/80",
          )}
        >
          {cell.label}
        </p>
        {cell.detail ? (
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{cell.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: "codepush", title: "Legacy CodePush", note: "App Center, retired" },
  { key: "clouds", title: "Hosted OTA services", note: "Centralized clouds" },
] as const;

export function ComparisonTable() {
  return (
    <>
      {/* Desktop / tablet */}
      <div className="relative hidden md:block">
        {/* Raised FireOTA column, drawn behind its cells and spanning the whole table. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[30%] w-[25%] rounded-2xl border border-brand/40 bg-gradient-to-b from-brand/[0.09] via-brand/[0.04] to-transparent shadow-[0_30px_80px_-40px_rgba(255,90,31,0.55)]"
        />
        <div role="table" aria-label="FireOTA compared with alternatives" className="relative">
          <div role="row" className="grid grid-cols-[30%_25%_22.5%_22.5%] items-end">
            <div
              role="columnheader"
              className="px-5 pb-5 pt-10 text-[12px] font-medium uppercase tracking-[0.12em] text-faint"
            >
              Feature
            </div>
            <div role="columnheader" className="relative px-5 pb-5 pt-10">
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-brand/30">
                Recommended
              </span>
              <span className="flex items-center gap-2">
                <BrandMark className="size-6" />
                <span className="font-display text-[17px] font-bold tracking-tight">FireOTA</span>
              </span>
              <p className="mt-1 text-[12px] text-muted-foreground">Your Firebase, your rules</p>
            </div>
            {COLUMNS.map((column) => (
              <div key={column.key} role="columnheader" className="px-5 pb-5 pt-10">
                <p className="text-[15px] font-semibold text-foreground/80">{column.title}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{column.note}</p>
              </div>
            ))}
          </div>

          {ROWS.map((row) => (
            <div
              key={row.feature}
              role="row"
              className="group grid grid-cols-[30%_25%_22.5%_22.5%] border-t border-border/60 transition-colors hover:bg-surface-2/30"
            >
              <div role="rowheader" className="flex items-center gap-3 px-5 py-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground transition-colors group-hover:border-brand/40 group-hover:text-brand">
                  <row.icon className="size-4" aria-hidden />
                </span>
                <span className="text-[14px] font-semibold text-foreground">{row.feature}</span>
              </div>
              <div role="cell" className="px-5 py-5">
                <Value cell={row.fireota} strong />
              </div>
              <div role="cell" className="px-5 py-5">
                <Value cell={row.codepush} />
              </div>
              <div role="cell" className="px-5 py-5">
                <Value cell={row.clouds} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phones: one card per feature */}
      <div className="space-y-3 md:hidden">
        {ROWS.map((row) => (
          <div key={row.feature} className="rounded-2xl border border-border/80 bg-surface/40 p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg border border-border/80 bg-background/60 text-brand">
                <row.icon className="size-4" aria-hidden />
              </span>
              <p className="text-[14px] font-semibold">{row.feature}</p>
            </div>
            <div className="mt-3 rounded-xl border border-brand/40 bg-brand/[0.06] p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
                <BrandMark className="size-4" /> FireOTA
              </p>
              <Value cell={row.fireota} strong />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {COLUMNS.map((column) => (
                <div key={column.key} className="rounded-xl bg-surface-2/40 p-3">
                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                    {column.title}
                  </p>
                  <Value cell={row[column.key]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
