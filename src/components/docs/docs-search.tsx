/**
 * "Search or Ask AI" for the docs (⌘K / Ctrl+K).
 *   Search  — instant full-text search over every page and section, grouped like the sidebar.
 *   Ask AI  — a question answered by the docs assistant (Groq) from the most relevant doc sections.
 * Keyboard: ↑/↓ navigate, ↵ select or send, Tab switch mode, Esc close.
 */
import { friendlyError } from "@/lib/friendly-error";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  Clipboard,
  Loader2,
  MessageCircleQuestion,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { MIcon } from "@/components/docs/docs-ui";
import { docGroups } from "@/components/docs/pages";
import { docIndex, hitUrl, searchDocs, type DocHit } from "@/components/docs/search-index";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { askDocs } from "@/lib/api/docs.functions";
import { cn } from "@/lib/utils";

type Mode = "search" | "ask";

interface Turn {
  question: string;
  answer: string | null;
  sources: { title: string; url: string }[];
  note: string | null;
  error?: string;
}

function isMac() {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-background px-1.5 font-sans text-[11px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
      {children}
    </kbd>
  );
}

/** Starting suggestions shown before typing. */
function suggestions(): DocHit[] {
  const wanted = [
    "quickstart",
    "install-sdk",
    "publish",
    "rollouts",
    "ci",
    "code-signing",
    "troubleshooting",
  ];
  const pages = docIndex().filter((h) => h.sectionId === null);
  return wanted
    .map((slug) => pages.find((p) => p.slug === slug))
    .filter((p): p is DocHit => Boolean(p));
}

/**
 * "Search | Ask AI" pill with a rotating rainbow glow (web port of the AIGlowSearch component).
 * A blurred conic gradient sits behind the pill and spins via a CSS animation, which the
 * browser runs on the compositor (GPU) thread — smooth even while JavaScript is busy.
 * Respects prefers-reduced-motion.
 */
const GLOW_COLORS = ["#ff9a9e", "#fecfef", "#c3b5ff", "#a1c4fd", "#b8f5c8", "#fdf6a3", "#ffc39e", "#ff9a9e"];
const GLOW_SPREAD = 6; // px the colour ring extends past the pill
const GLOW_BLUR = 14; // px softness of the halo
const GLOW_DURATION = 5000; // ms per full rotation

function AIGlowToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden
        className="pointer-events-none absolute overflow-hidden rounded-full opacity-85"
        style={{ inset: -GLOW_SPREAD, filter: `blur(${GLOW_BLUR}px)` }}
      >
        <div
          className="absolute left-1/2 top-1/2 aspect-square w-[160%] motion-safe:animate-[fireota-glow-spin_linear_infinite]"
          style={{
            translate: "-50% -50%",
            background: `conic-gradient(from 0deg, ${GLOW_COLORS.join(", ")})`,
            animationDuration: `${GLOW_DURATION}ms`,
          }}
        />
      </div>
      <style>{`@keyframes fireota-glow-spin{to{rotate:360deg}}`}</style>
      <div className="relative flex items-center gap-1 rounded-full border border-black/[0.08] bg-[#f7f7f8] p-1.5 pl-1.5 dark:border-white/10 dark:bg-[#1c1d21]">
        {(["search", "ask"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={mode === m}
            className={cn(
              "rounded-full px-4 py-2 text-[15px] font-medium transition-all duration-200 sm:px-[18px]",
              mode === m
                ? "bg-[#1c1c1e] text-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] dark:bg-white dark:text-[#1c1c1e]"
                : "text-[#6b6b70] hover:text-foreground dark:text-white/60",
            )}
          >
            {m === "search" ? "Search" : "Ask AI"}
          </button>
        ))}
      </div>
    </div>
  );
}

function CodeWithCopy({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-2xl border border-border bg-surface/70 dark:bg-[#0B0C0E]">
      <pre className="overflow-x-auto py-3.5 pl-4 pr-14 font-mono text-[13px] leading-6 text-foreground dark:text-white">
        {code}
      </pre>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        aria-label="Copy code"
        className="absolute right-2.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
      </button>
    </div>
  );
}

/** Renders the assistant's markdown subset: paragraphs, "- " lists, ``` code, `code`, **bold**, [links](/docs/…). */
function Answer({ text, onLink }: { text: string; onLink: (url: string) => void }) {
  const inline = (line: string, key: string) => {
    const parts: ReactNode[] = [];
    // Links: [label](url), and the "**label**(/docs/…)" form some models produce.
    const re =
      /(`[^`]+`|\*\*[^*]+\*\*\(\/docs[^)\s]*\)|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|(?<![\w(])\/docs\/[\w-]+(?:#[\w-]+)?)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const token = m[0];
      if (token.startsWith("`")) {
        parts.push(
          <code
            key={`${key}-${i}`}
            className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px]"
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else if (token.startsWith("**") && !token.endsWith(")")) {
        parts.push(<strong key={`${key}-${i}`}>{token.slice(2, -2)}</strong>);
      } else {
        const [, rawLabel, rawUrl] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ??
          /^\*\*([^*]+)\*\*\(([^)]+)\)$/.exec(token) ?? [token, token, token];
        const label = rawLabel?.replace(/\*\*/g, "");
        const url = rawUrl;
        const internal = url?.startsWith("/docs");
        parts.push(
          internal ? (
            <button
              key={`${key}-${i}`}
              type="button"
              onClick={() => onLink(url!)}
              className="text-brand underline-offset-2 hover:underline"
            >
              {label}
            </button>
          ) : (
            <span key={`${key}-${i}`}>{label}</span>
          ),
        );
      }
      last = m.index + token.length;
      i += 1;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };

  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trimStart().startsWith("```")) {
      const indent = line.length - line.trimStart().length;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```"))
        code.push(lines[i++]!.slice(indent));
      blocks.push(<CodeWithCopy key={i} code={code.join("\n")} />);
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i]!))
        items.push(lines[i++]!.replace(/^\s*[-*] /, ""));
      i -= 1;
      blocks.push(
        <ul key={i} className="list-disc space-y-1 pl-5 marker:text-brand">
          {items.map((item, j) => (
            <li key={j}>{inline(item, `${i}-${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^#{1,4} /.test(line)) {
      blocks.push(
        <p key={i} className="font-semibold">
          {inline(line.replace(/^#{1,4} /, ""), String(i))}
        </p>,
      );
    } else if (line.trim()) {
      blocks.push(<p key={i}>{inline(line, String(i))}</p>);
    }
  }
  return <div className="space-y-3 text-[14px] leading-relaxed">{blocks}</div>;
}

export function DocsSearch({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mac = useMemo(isMac, []);

  // ⌘K / Ctrl+K (and "/" outside inputs) open the dialog from anywhere in the docs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, mode]);

  const results = useMemo(() => (query.trim() ? searchDocs(query, 20) : suggestions()), [query]);
  useEffect(() => setActive(0), [query, mode]);

  // Group results under their sidebar group, in sidebar order.
  const grouped = useMemo(() => {
    const order = docGroups.map((g) => g.title);
    const map = new Map<string, DocHit[]>();
    for (const r of results) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [results]);
  const flat = grouped.flatMap(([, hits]) => hits);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (url: string) => {
    setOpen(false);
    onNavigate?.();
    const [path, hash] = url.split("#");
    const slug = path!.replace(/^\/docs\/?/, "");
    void navigate(
      slug ? { to: "/docs/$slug", params: { slug }, hash: hash ?? "" } : { to: "/docs" },
    );
  };

  const ask = async () => {
    const question = query.trim();
    if (question.length < 2 || asking) return;
    setAsking(true);
    setQuery("");
    setTurns((t) => [...t, { question, answer: null, sources: [], note: null }]);
    try {
      const history = turns
        .filter((t) => t.answer)
        .slice(-3)
        .map((t) => ({ question: t.question, answer: t.answer! }));
      const result = await askDocs({ data: { question, history } });
      setTurns((t) =>
        t.map((turn, i) =>
          i === t.length - 1
            ? { ...turn, answer: result.answer, sources: result.sources, note: result.unavailable }
            : turn,
        ),
      );
    } catch (error) {
      const message = friendlyError(error, "The assistant could not answer.");
      setTurns((t) =>
        t.map((turn, i) => (i === t.length - 1 ? { ...turn, error: message } : turn)),
      );
    } finally {
      setAsking(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      setMode((m) => (m === "search" ? "ask" : "search"));
      return;
    }
    if (mode === "search") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter" && flat[active]) {
        e.preventDefault();
        go(hitUrl(flat[active]!));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      void ask();
    }
  };

  let index = -1;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2.5 rounded-full border border-border bg-background px-3.5 text-left text-[14px] text-muted-foreground shadow-sm transition-colors hover:border-brand/40 dark:bg-surface-2/40 dark:text-white/80"
      >
        <Search className="size-4" />
        <span className="flex-1">Search or Ask AI</span>
        <span className="flex gap-1">
          <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onKeyDown={onKeyDown}
          className="top-[8vh] flex max-h-[84vh] max-w-3xl translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:top-[10vh] [&>button:last-child]:hidden"
        >
          <DialogTitle className="sr-only">Search the documentation</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border p-4">
            <label className="flex h-12 flex-1 items-center gap-2.5 rounded-full border border-border bg-background px-4 shadow-sm focus-within:border-brand/50">
              {mode === "search" ? (
                <Search className="size-5 text-muted-foreground" />
              ) : (
                <MessageCircleQuestion className="size-5 text-muted-foreground" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === "search" ? "Search…" : "Ask AI…"}
                aria-label={mode === "search" ? "Search the documentation" : "Ask the AI assistant"}
                className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </label>
            <AIGlowToggle mode={mode} onChange={setMode} />
          </div>

          <div className="relative h-0.5 overflow-hidden">
            {asking ? (
              <span className="absolute inset-y-0 w-1/4 animate-[fireota-progress_1.2s_ease-in-out_infinite] bg-brand" />
            ) : null}
          </div>
          <style>{`@keyframes fireota-progress{0%{left:-25%}100%{left:100%}}`}</style>
          <div ref={listRef} className="min-h-[280px] flex-1 overflow-y-auto p-3">
            {mode === "search" ? (
              flat.length === 0 ? (
                <p className="px-3 py-16 text-center text-[14px] text-muted-foreground">
                  No results for “{query}”. Press <Kbd>tab</Kbd> to ask the AI instead.
                </p>
              ) : (
                grouped.map(([group, hits]) => (
                  <Fragment key={group}>
                    <p className="px-3 pb-1.5 pt-3 text-[13px] text-muted-foreground">
                      {query.trim() ? group : group === "Get started" ? "Popular" : group}
                    </p>
                    {hits.map((hit) => {
                      index += 1;
                      const i = index;
                      return (
                        <button
                          key={hit.key}
                          type="button"
                          data-index={i}
                          onMouseMove={() => setActive(i)}
                          onClick={() => go(hitUrl(hit))}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left",
                            i === active && "bg-surface-2",
                          )}
                        >
                          <MIcon
                            name={hit.sectionId ? "tag" : hit.groupIcon}
                            className="mt-0.5 text-[20px] text-muted-foreground"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium text-foreground">
                              {hit.title}
                              {hit.sectionId ? (
                                <span className="font-normal text-muted-foreground">
                                  {" "}
                                  · {hit.pageTitle}
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-[13px] text-muted-foreground">
                              {"snippet" in hit && query.trim()
                                ? (hit as DocHit & { snippet: string }).snippet
                                : hit.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </Fragment>
                ))
              )
            ) : turns.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center text-[14px] text-muted-foreground">

                <p>
                  Ask the question above and then press <Kbd>↵</Kbd> to send it.
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {[
                    "How do I publish my first update?",
                    "How does staged rollout work?",
                    "How do I set up code signing?",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setQuery(q);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-[12px] hover:border-brand/50 hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 p-2">
                {turns.map((turn, i) => (
                  <div key={i} className="space-y-3">
                    <p className="text-[17px] font-semibold text-foreground">
                      You asked: “{turn.question}”
                    </p>
                    {turn.error ? (
                      <p className="text-[14px] text-danger">{turn.error}</p>
                    ) : turn.answer === null && !turn.note ? (
                      <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Reading the docs…
                      </p>
                    ) : (
                      <>
                        {turn.note ? (
                          <p className="text-[14px] text-muted-foreground">{turn.note}</p>
                        ) : null}
                        {turn.answer ? <Answer text={turn.answer} onLink={go} /> : null}
                        {turn.sources.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {turn.sources.slice(0, 4).map((s) => (
                              <button
                                key={s.url}
                                type="button"
                                onClick={() => go(s.url)}
                                className="flex items-center gap-1 rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[12px] text-muted-foreground hover:border-brand/50 hover:text-foreground"
                              >
                                <MIcon name="description" className="text-[14px]" /> {s.title}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> {mode === "search" ? "to select" : "to send question"}
            </span>
            {mode === "search" ? (
              <span className="hidden items-center gap-1.5 sm:flex">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to navigate
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <Kbd>tab</Kbd> to switch mode
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Kbd>esc</Kbd> to close
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[12px]">
              {mode === "search" ? "Search by FireOTA" : "AI assistant by Groq"}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
