/**
 * Feedback while the router loads the next page (code-split chunks, route loaders):
 * a full-screen loader when opening sign in / sign up, a thin top progress bar elsewhere.
 * Shown only after a short delay, so fast navigations don't flicker.
 */
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/fireota/brand-mark";

const AUTH_PAGES: Record<string, string> = {
  "/login": "Opening sign in…",
  "/signup": "Opening sign up…",
};

export function NavigationLoader() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const target = useRouterState({ select: (s) => s.location.pathname });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!visible) return null;

  const authLabel = AUTH_PAGES[target];
  if (authLabel) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-[100] grid place-items-center bg-background/80 backdrop-blur-sm animate-in fade-in-0"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative grid size-20 place-items-center">
            <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-brand/15 border-t-brand [animation-duration:1s]" />
            <BrandMark className="size-9" />
          </div>
          <p className="text-[14px] font-medium text-muted-foreground">{authLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-brand/15">
      <span className="absolute inset-y-0 w-1/3 animate-[fireota-nav_1s_ease-in-out_infinite] bg-brand" />
      <style>{`@keyframes fireota-nav{0%{left:-33%}100%{left:100%}}`}</style>
    </div>
  );
}
