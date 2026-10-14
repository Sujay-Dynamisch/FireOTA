import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WizardRail({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-border px-4 py-3">
      {steps.map((step, index) => {
        const state = index === current ? "active" : index < current ? "done" : "pending";
        return (
          <li key={step} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "font-mono text-[11px]",
                state === "done" ? "text-success" : state === "active" ? "text-brand" : "text-faint",
              )}
            >
              {state === "done" ? "✓" : state === "active" ? "◧" : "○"}
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
    <div className="overflow-hidden rounded-lg border border-border bg-surface/50">
      <WizardRail steps={steps} current={current} />
      <div className="p-5">
        <h2 className="font-display text-[16px] font-bold tracking-tight">{title}</h2>
        {description ? <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">{description}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">{footer}</div>
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
