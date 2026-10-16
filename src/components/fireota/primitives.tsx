import { Link } from "@tanstack/react-router";
import { Check, Copy, HelpCircle, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Environment, Platform, ReleaseStatus } from "@/lib/types";

/* ---------------------------------- text ---------------------------------- */

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono", className)}>{children}</span>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[10px] uppercase tracking-[0.1em] text-faint", className)}>{children}</span>
  );
}

/* --------------------------------- badges --------------------------------- */

const statusMeta: Record<ReleaseStatus, { label: string; dot: string; text: string; icon: string }> = {
  draft: { label: "DRAFT", dot: "bg-faint", text: "text-muted-foreground", icon: "○" },
  uploading: { label: "UPLOADING", dot: "bg-info", text: "text-info", icon: "↥" },
  processing: { label: "PROCESSING", dot: "bg-warning", text: "text-warning", icon: "◐" },
  ready: { label: "READY", dot: "bg-info", text: "text-info", icon: "◇" },
  published: { label: "PUBLISHED", dot: "bg-success", text: "text-success", icon: "✓" },
  paused: { label: "PAUSED", dot: "bg-warning", text: "text-warning", icon: "‖" },
  rolled_back: { label: "ROLLED BACK", dot: "bg-danger", text: "text-danger", icon: "↩" },
  archived: { label: "ARCHIVED", dot: "bg-faint", text: "text-muted-foreground", icon: "▤" },
  failed: { label: "FAILED", dot: "bg-danger", text: "text-danger", icon: "✕" },
};

export function StatusBadge({ status, className }: { status: ReleaseStatus; className?: string }) {
  const meta = statusMeta[status] ?? {
    label: String(status || "UNKNOWN").toUpperCase(),
    dot: "bg-faint",
    text: "text-muted-foreground",
    icon: "○",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-mono", meta.text, className)}>
      <span aria-hidden className="text-[10px] leading-none">
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

const envMeta: Record<Environment, { label: string; className: string }> = {
  production: { label: "PRODUCTION", className: "bg-danger/15 text-danger border-danger/30" },
  beta: { label: "BETA", className: "bg-surface-2 text-muted-foreground border-border" },
  staging: { label: "STAGING", className: "bg-surface-2 text-muted-foreground border-border" },
  development: { label: "DEVELOPMENT", className: "bg-surface-2 text-faint border-border" },
};

export function EnvBadge({ environment, className }: { environment: Environment; className?: string }) {
  const meta = envMeta[environment] ?? {
    label: String(environment || "DEVELOPMENT").toUpperCase(),
    className: "bg-surface-2 text-faint border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium",
        meta.className,
        className,
      )}
    >
      {environment === "production" ? <span aria-hidden className="size-1.5 rounded-full bg-danger" /> : null}
      {meta.label}
    </span>
  );
}

export function PlatformTag({ platform }: { platform: Platform | "all" }) {
  const label = platform === "android" ? "Android" : platform === "ios" ? "iOS" : "Android + iOS";
  return <span className="font-mono text-[11px] text-muted-foreground">{label}</span>;
}

export function RolloutBar({
  value,
  tone = "brand",
  showValue = true,
  className,
}: {
  value: number;
  tone?: "brand" | "neutral" | "warning" | "danger" | "success";
  showValue?: boolean;
  className?: string;
}) {
  const fill =
    tone === "brand"
      ? "bg-brand"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : tone === "success"
            ? "bg-success"
            : "bg-foreground/70";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full fill-notch", fill)} style={{ width: `${value}%` }} />
      </div>
      {showValue ? <span className="w-9 text-right font-mono text-[11px]">{value}%</span> : null}
    </div>
  );
}

/* ------------------------------- containers -------------------------------- */

export function SectionCard({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-surface/50", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="text-[12px] font-medium">{title}</h2>
          {aside}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = false,
  progress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  accent?: boolean;
  progress?: number;
}) {
  const Icon = icon;
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        accent ? "border-brand/20 bg-brand/[0.04]" : "border-border bg-surface/50",
      )}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        {label}
        {Icon ? <Icon aria-hidden className="size-3.5 text-faint" /> : null}
      </div>
      <div className={cn("mt-1.5 font-display text-[24px] font-bold tracking-tight", accent && "text-brand")}>
        {value}
      </div>
      {progress !== undefined ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-brand fill-notch" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {hint ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetaGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{item.label}</dt>
          <dd className="mt-1 truncate text-[12px]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------- states & helpers ---------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const Icon = icon;
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16")}>
      {Icon ? (
        <span className="mb-3 grid size-10 place-items-center rounded-lg border border-border bg-surface-2/60">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
        </span>
      ) : null}
      <p className="font-display text-[15px] font-bold tracking-tight">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 inline-flex items-center gap-1.5 rounded-sm border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono text-[10px] text-danger">
        <span aria-hidden>✕</span> ERROR
      </span>
      <p className="font-display text-[15px] font-bold tracking-tight">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[12px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 15, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-3 min-w-0 animate-pulse rounded bg-surface-2"
              style={{ flex: `${c === 0 ? 18 : 12 + ((c * 7) % 14)} 1 0%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg border border-border bg-surface-2/40", className)} />;
}

export function HelpHint({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More information" className="text-faint hover:text-muted-foreground">
          <HelpCircle aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-[12px]">{children}</TooltipContent>
    </Tooltip>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
      aria-label={label}
    >
      {copied ? <Check aria-hidden className="size-3" /> : <Copy aria-hidden className="size-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{language}</span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-foreground">{code}</pre>
    </div>
  );
}

/* -------------------------------- timelines -------------------------------- */

export function Timeline({
  steps,
}: {
  steps: { label: string; at: string | null; state: "done" | "active" | "pending" | "failed" }[];
}) {
  return (
    <ol className="p-4">
      {steps.map((step, i) => {
        const mark =
          step.state === "done" ? "✓" : step.state === "active" ? "◐" : step.state === "failed" ? "✕" : "○";
        const tone =
          step.state === "done"
            ? "text-success"
            : step.state === "active"
              ? "text-warning"
              : step.state === "failed"
                ? "text-danger"
                : "text-faint";
        return (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("font-mono text-[12px] leading-5", tone)} aria-hidden>
                {mark}
              </span>
              {i < steps.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className="pb-3">
              <p className="text-[12px]">{step.label}</p>
              <p className="font-mono text-[10px] text-faint">{step.at ?? "pending"}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityFeed({ items }: { items: { id: string; kind: string; message: string; meta: string; at: string }[] }) {
  const dot: Record<string, string> = {
    published: "bg-success",
    paused: "bg-warning",
    firebase: "bg-brand",
    rolled_back: "bg-danger",
    member: "bg-faint",
    api_key: "bg-info",
  };
  return (
    <ul className="space-y-2.5 p-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-2.5">
          <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot[item.kind] ?? "bg-faint")} />
          <div className="min-w-0">
            <p className="truncate text-[12px]">{item.message}</p>
            <p className="font-mono text-[10px] text-faint">
              {item.meta} · {item.at}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to as never}
      className="font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      {children}
    </Link>
  );
}
