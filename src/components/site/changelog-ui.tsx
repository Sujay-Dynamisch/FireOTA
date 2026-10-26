import { Check, Copy, Github, Mail, Rss, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { GITHUB_URL } from "@/components/site/header-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChangelogAuthor, ChangelogBlock } from "@/content/changelog";

export function Authors({ authors }: { authors: ChangelogAuthor[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {authors.map((author) => (
        <a
          key={author.name}
          href={author.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-[14px] hover:underline"
        >
          <img
            src={author.avatar}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-full bg-surface-2"
            loading="lazy"
          />
          {author.name}
        </a>
      ))}
    </div>
  );
}

export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-border bg-surface/60 px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function Blocks({ blocks }: { blocks: ChangelogBlock[] }) {
  return (
    <div className="space-y-5 text-[17px] leading-relaxed text-foreground/85">
      {blocks.map((block, i) => {
        if (block.type === "h") {
          return (
            <h2
              key={i}
              className="pt-3 font-display text-[24px] font-bold tracking-tight text-foreground"
            >
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="list-disc space-y-2 pl-6 marker:text-brand">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "code") {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0B0C0E] px-5 py-4 font-mono text-[13px] leading-6 text-white"
            >
              {block.code}
            </pre>
          );
        }
        return <p key={i}>{block.text}</p>;
      })}
    </div>
  );
}

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex h-11 items-center gap-2.5 rounded-full border border-border bg-background px-4 focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/20">
      <Search className="size-4 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
        aria-label="Search the changelog"
        className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

function PillButton({
  children,
  ...props
}: { children: ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-[15px] font-semibold transition-colors hover:bg-surface-2/70"
    >
      {children}
    </button>
  );
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 p-2 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{value}</code>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Follow (GitHub) and Subscribe (RSS feed or GitHub release notifications). */
export function FollowSubscribe() {
  const [open, setOpen] = useState(false);
  const feed =
    typeof window !== "undefined" ? `${window.location.origin}/changelog.xml` : "/changelog.xml";
  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-[15px] font-semibold transition-colors hover:bg-surface-2/70"
        >
          <Github className="size-4" /> Follow
        </a>
        <PillButton onClick={() => setOpen(true)}>
          <Mail className="size-4" /> Subscribe
        </PillButton>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe to the changelog</DialogTitle>
            <DialogDescription>Get every FireOTA release the moment it ships.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-[13px]">
            <section className="space-y-2">
              <p className="flex items-center gap-2 font-semibold">
                <Rss className="size-4 text-brand" /> RSS feed
              </p>
              <p className="text-muted-foreground">
                Add this URL to any feed reader (Feedly, Inoreader, Slack's /feed, Outlook).
              </p>
              <CopyRow value={feed} />
              <a
                href="/changelog.xml"
                target="_blank"
                rel="noreferrer"
                className="inline-block text-brand hover:underline"
              >
                Open the feed
              </a>
            </section>
            <section className="space-y-2">
              <p className="flex items-center gap-2 font-semibold">
                <Mail className="size-4 text-brand" /> Email via GitHub
              </p>
              <p className="text-muted-foreground">
                On GitHub choose <strong>Watch → Custom → Releases</strong> to get an email for each
                new SDK and CLI release.
              </p>
              <a
                href={`${GITHUB_URL}/subscription`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 font-semibold text-background hover:opacity-90"
              >
                <Github className="size-4" /> Watch releases on GitHub
              </a>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
