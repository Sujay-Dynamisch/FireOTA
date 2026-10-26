/**
 * Shared header actions for the public site (docs, changelog):
 * Changelog link, "Star us on GitHub" with the live star count, and an Auto/Light/Dark theme picker.
 */
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Moon, Star, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const GITHUB_REPO = "Sujay-Dynamisch/FireOTA";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

const THEME_KEY = "fireota-theme";
type ThemeChoice = "auto" | "light" | "dark";

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : choice === "dark";
  const root = document.documentElement.classList;
  root.toggle("dark", dark);
  root.toggle("light", !dark);
}

/** Auto follows the operating system (and keeps following it); Light/Dark are remembered. */
export function ThemeSelect({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("auto");

  useEffect(() => setChoice(readChoice()), []);
  useEffect(() => {
    if (choice !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const select = (next: ThemeChoice) => {
    setChoice(next);
    try {
      if (next === "auto") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked: still apply for this page view
    }
    applyTheme(next);
  };

  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: "auto", label: "Auto", icon: SunMoon },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];
  const current = options.find((o) => o.value === choice) ?? options[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
          className,
        )}
        aria-label={`Theme: ${current.label}`}
      >
        <current.icon className="size-4" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => select(option.value)}
            className="gap-2 text-[13px]"
          >
            <option.icon className="size-4" />
            {option.label}
            {option.value === choice ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatStars(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
}

/** Links to the repository and shows its star count (cached for the browser session). */
export function GitHubStarButton({ className }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    const cacheKey = "fireota-github-stars";
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setStars(Number(cached));
        return;
      }
    } catch {
      // ignore
    }
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((repo: { stargazers_count?: number } | null) => {
        if (typeof repo?.stargazers_count !== "number") return;
        setStars(repo.stargazers_count);
        try {
          sessionStorage.setItem(cacheKey, String(repo.stargazers_count));
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // offline or rate limited: the button still works without a count
      });
    return () => controller.abort();
  }, []);

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2",
        className,
      )}
    >
      <Star className="size-4" />
      <span className="hidden md:inline">Star us on GitHub</span>
      {stars !== null ? (
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {formatStars(stars)}
        </span>
      ) : null}
    </a>
  );
}

export function ChangelogLink({ className }: { className?: string }) {
  return (
    <Link
      to="/changelog"
      className={cn(
        "hidden h-9 items-center rounded-full px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 sm:flex [&.active]:text-brand",
        className,
      )}
    >
      Changelog
    </Link>
  );
}
