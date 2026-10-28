import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WizardRail({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-semibold text-brand">
          Step {current + 1} of {steps.length}
        </span>
        <span className="truncate text-muted-foreground">{steps[current]}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-[#ff9a5a] transition-[width] duration-500"
          style={{ width: `${((current + 1) / steps.length) * 100}%` }}
        />
      </div>
      <ol className="mt-3 hidden flex-wrap gap-x-4 gap-y-1.5 sm:flex">
        {steps.map((step, index) => {
          const state = index === current ? "active" : index < current ? "done" : "pending";
          return (
            <li key={step} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[10px] font-semibold",
                  state === "done"
                    ? "bg-success/15 text-success"
                    : state === "active"
                      ? "bg-brand text-white"
                      : "bg-surface-2 text-faint",
                )}
              >
                {state === "done" ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  "text-[12px]",
                  state === "active" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function WizardShell({
  steps,
  current,
  title,
  description,
  children,
  footer,
}: {
  steps: string[];
  current: number;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-background/85 shadow-xl shadow-black/[0.04] backdrop-blur">
      <WizardRail steps={steps} current={current} />
      <div className="p-6">
        <h2 className="font-display text-[20px] font-bold tracking-tight">{title}</h2>
        {description ? <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface/40 px-5 py-3.5">{footer}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  aside,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-[12px] font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint ? <p className="font-mono text-[10px] text-faint">{hint}</p> : null}
    </div>
  );
}

export function CheckList({ items }: { items: { label: string; granted: boolean; optional?: boolean }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[12px]">
          <span
            aria-hidden
            className={cn("font-mono text-[12px]", item.granted ? "text-success" : item.optional ? "text-faint" : "text-warning")}
          >
            {item.granted ? "✓" : item.optional ? "○" : "!"}
          </span>
          <span className={item.granted ? "" : "text-muted-foreground"}>{item.label}</span>
          {item.optional ? <span className="font-mono text-[10px] text-faint">optional</span> : null}
        </li>
      ))}
    </ul>
  );
}
