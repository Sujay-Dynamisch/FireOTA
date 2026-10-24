/**
 * ChatGPT/Claude-style conversation list for the agent chat: new chat, search, date groups,
 * and rename/delete on each saved conversation.
 */
import {
  Check,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/fireota/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversationSummary } from "@/lib/api/conversations.functions";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** Buckets like ChatGPT: Today, Yesterday, Previous 7 days, Previous 30 days, then by month. */
function groupLabel(iso: string, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - DAY) return "Yesterday";
  if (t >= startOfToday - 7 * DAY) return "Previous 7 days";
  if (t >= startOfToday - 30 * DAY) return "Previous 30 days";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function ChatHistory({
  conversations,
  loading,
  activeId,
  disabled,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  /** Blocks switching while the agent is answering. */
  disabled?: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);

  const groups = useMemo(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    const out: { label: string; items: ConversationSummary[] }[] = [];
    for (const c of conversations) {
      if (q && !c.title.toLowerCase().includes(q)) continue;
      const label = groupLabel(c.updatedAt, now);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [conversations, query]);

  const commitRename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    const original = conversations.find((c) => c.id === editing.id)?.title;
    setEditing(null);
    if (title && title !== original) await onRename(editing.id, title);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-[12px]"
          disabled={disabled}
          onClick={onNew}
        >
          <Plus /> New chat
        </Button>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] focus-within:border-brand/60">
          <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full bg-transparent outline-none placeholder:text-faint"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Previous chats">
        {loading ? (
          <div className="space-y-1.5 px-1 pt-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 pt-6 text-center text-[11px] text-faint">
            {query ? "No chats match your search." : "Your chats will appear here."}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="pt-3">
              <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-wider text-faint">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((c) => {
                  const active = c.id === activeId;
                  if (editing?.id === c.id) {
                    return (
                      <li
                        key={c.id}
                        className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1"
                      >
                        <input
                          autoFocus
                          value={editing.title}
                          maxLength={120}
                          aria-label="Chat title"
                          onChange={(e) => setEditing({ id: c.id, title: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitRename();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          onBlur={() => void commitRename()}
                          className="min-w-0 flex-1 rounded bg-background px-1.5 py-0.5 text-[12px] outline-none ring-1 ring-brand/60"
                        />
                        <button
                          type="button"
                          aria-label="Save title"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void commitRename()}
                        >
                          <Check className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel rename"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setEditing(null)}
                        >
                          <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        disabled={disabled && !active}
                        onClick={() => onSelect(c.id)}
                        title={c.title}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          active
                            ? "bg-surface-2 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
                        )}
                      >
                        <MessageSquare className="size-3.5 shrink-0 opacity-60" aria-hidden />
                        <span className="truncate">{c.title}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Options for ${c.title}`}
                            className={cn(
                              "absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:opacity-100",
                              active
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100",
                            )}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onSelect={() => setEditing({ id: c.id, title: c.title })}
                          >
                            <Pencil className="size-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-danger focus:text-danger"
                            onSelect={() => setDeleting(c)}
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete chat?"
        description={
          <>
            <span className="font-medium text-foreground">{deleting?.title}</span> will be deleted
            permanently. Releases, rollouts and approvals the agent already made are not affected.
          </>
        }
        confirmLabel="Delete chat"
        destructive
        onConfirm={async () => {
          if (deleting) await onDelete(deleting.id);
        }}
      />
    </div>
  );
}
