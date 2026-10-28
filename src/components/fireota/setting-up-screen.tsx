/**
 * Full-screen loader shown while the signed-in account is checked, so neither the dashboard nor
 * the onboarding wizard flashes before the app knows where the user belongs.
 */
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/fireota/brand-mark";
import { cn } from "@/lib/utils";

export function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -left-32 -top-32 size-[420px] rounded-full bg-brand/15 blur-[110px]" />
      <div className="absolute -bottom-40 right-0 size-[460px] rounded-full bg-[#ffca28]/15 blur-[120px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] opacity-40 [background-size:22px_22px]" />
    </div>
  );
}

const SETUP_STEPS = ["Signing you in", "Loading your workspace", "Checking your Firebase connection", "Getting things ready"];

export function SettingUpScreen({
  workspace,
  title = "Setting up your account…",
}: {
  workspace?: string | undefined;
  title?: string;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setActive((a) => Math.min(a + 1, SETUP_STEPS.length - 1)), 650);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-5">
      <BackgroundGlow />
      <div
        role="status"
        aria-live="polite"
        className="relative w-full max-w-sm rounded-3xl border border-border bg-background/85 p-8 text-center shadow-xl shadow-black/[0.04] backdrop-blur"
      >
        <div className="relative mx-auto grid size-24 place-items-center">
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-brand/15 border-t-brand [animation-duration:1.2s]" />
          <span className="absolute inset-3 animate-pulse rounded-full bg-brand/10" />
          <BrandMark className="relative size-11" />
        </div>
        <h1 className="mt-6 font-display text-[22px] font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {workspace ? `Welcome back to ${workspace}.` : "This only takes a moment."}
        </p>
        <ul className="mx-auto mt-6 space-y-3 text-left">
          {SETUP_STEPS.map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2.5 text-[13px] transition-colors",
                i < active ? "text-foreground" : i === active ? "font-medium text-foreground" : "text-faint",
              )}
            >
              {i < active ? (
                <CheckCircle2 className="size-4 text-success" aria-hidden />
              ) : i === active ? (
                <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
              ) : (
                <Circle className="size-4" aria-hidden />
              )}
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-8 flex items-center justify-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
          <img src="/brand/eco/firebase.svg" alt="" aria-hidden width={16} height={16} className="size-4" />
          Secured by your own Google Firebase project
        </p>
      </div>
    </div>
  );
}
