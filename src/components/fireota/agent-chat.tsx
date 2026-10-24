/**
 * Chat with a FireOTA agent: multi-turn conversation, tool activity, inline approvals,
 * `/` commands and .fota attachments that are uploaded to the releases an agent creates.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Copy,
  FileArchive,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatHistory } from "@/components/fireota/chat-history";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { Markdown } from "@/components/fireota/markdown";
import { EmptyState, SectionCard } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { agentsService, conversationsService } from "@/services";

interface Step {
  tool: string;
  input: string;
  status: string;
  summary: string;
  approvalId: string | null;
  resultId: string | null;
}

interface Upload {
  releaseId: string;
  label: string;
  state: "uploading" | "done" | "failed";
  percent: number;
  error?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  attachment?: { name: string; size: number };
  steps?: Step[];
  uploads?: Upload[];
  decisions?: Record<string, "approved" | "rejected">;
  error?: boolean;
}

/** Per-browser convenience: which saved chat to reopen. The chats themselves live on the server. */
const ACTIVE_KEY = "fireota.agent-chat.active";

const COMMANDS: { name: string; hint: string; agent: string; prompt: string; attach?: boolean }[] =
  [
    {
      name: "status",
      hint: "Overview of apps, channels and live updates",
      agent: "release-manager",
      prompt:
        "Give me a status overview of every app: channels, the update each one serves per platform, runtime and rollout.",
    },
    {
      name: "releases",
      hint: "Latest updates with health",
      agent: "release-reviewer",
      prompt:
        "List the latest updates with their status, runtime, rollout and install failure rate.",
    },
    {
      name: "health",
      hint: "Is production healthy?",
      agent: "release-reviewer",
      prompt:
        "Is the current production update healthy? Give me a go / hold / roll back recommendation.",
    },
    {
      name: "upload",
      hint: "Ship an attached .fota package",
      agent: "release-manager",
      prompt:
        "Create a release from the attached package for app <app> on channel production, platform android, runtime <1.0>, message: <what changed>.",
      attach: true,
    },
    {
      name: "publish",
      hint: "Publish a ready update",
      agent: "release-manager",
      prompt: "Publish the newest ready update to production at 10% rollout.",
    },
    {
      name: "rollout",
      hint: "Move a rollout forward",
      agent: "release-manager",
      prompt: "Move the latest production update to 25% if its failure rate is under 1%.",
    },
    {
      name: "promote",
      hint: "Copy an update to another channel",
      agent: "release-manager",
      prompt: "Promote the newest beta update to production at 10%.",
    },
    {
      name: "pause",
      hint: "Stop new devices getting an update",
      agent: "release-manager",
      prompt: "Pause the latest production update.",
    },
    {
      name: "rollback",
      hint: "Roll a channel back",
      agent: "release-manager",
      prompt: "Roll back the latest production update and tell me which update devices go back to.",
    },
    {
      name: "channel",
      hint: "Create an environment",
      agent: "release-manager",
      prompt: "Create a staging channel for app <app>.",
    },
    {
      name: "security",
      hint: "Investigate security alerts",
      agent: "security-sentinel",
      prompt: "Investigate today's open security alerts and correlate them with the audit log.",
    },
    {
      name: "keys",
      hint: "Audit API keys",
      agent: "security-sentinel",
      prompt: "Do any API keys look leaked or unused? Recommend what to revoke.",
    },
    { name: "clear", hint: "Start a new chat", agent: "", prompt: "" },
  ];

const SUGGESTIONS: Record<string, string[]> = {
  "release-manager": ["status", "upload", "rollout", "channel"],
  "release-reviewer": ["health", "releases", "status", "rollout"],
  "security-sentinel": ["security", "keys", "status", "health"],
};

const TOOL_LABELS: Record<string, string> = {
  list_apps: "Read apps",
  list_releases: "Read updates",
  get_release_health: "Checked health",
  list_channels: "Read channels",
  list_security_events: "Read security alerts",
  list_audit_log: "Read audit log",
  list_api_keys: "Read API keys",
  create_channel: "Create channel",
  create_release: "Create release",
  publish_release: "Publish",
  set_rollout: "Change rollout",
  pause_release: "Pause",
  rollback_release: "Roll back",
  promote_release: "Promote",
  revoke_api_key: "Revoke API key",
};

const THINKING = ["Thinking…", "Reading your workspace…", "Checking releases…", "Working on it…"];

const uid = () => Math.random().toString(36).slice(2, 10);
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(2)} MB`;

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable: the last chat just isn't reopened automatically */
  }
}

/** A chat's title before the user renames it: its first question, like ChatGPT. */
function titleFrom(messages: Message[]) {
  const first =
    messages
      .find((m) => m.role === "user")
      ?.content.replace(/\s+/g, " ")
      .trim() ?? "";
  if (!first) return "New chat";
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

/** Text the model sees for an earlier assistant turn: its answer plus what it did. */
function historyText(m: Message) {
  if (m.role === "user") {
    return m.attachment ? `${m.content}\n[Attached: ${m.attachment.name}]` : m.content;
  }
  const actions = (m.steps ?? [])
    .filter((s) => s.status !== "completed" || s.resultId)
    .map((s) => `${s.tool} ${s.status}${s.resultId ? ` id=${s.resultId}` : ""}`);
  const uploads = (m.uploads ?? []).map(
    (u) =>
      `bundle upload to ${u.releaseId}: ${u.state === "done" ? "done, release is ready" : u.state}`,
  );
  const notes = [...actions, ...uploads];
  return notes.length ? `${m.content}\n\n(Actions: ${notes.join("; ")})` : m.content;
}

export function AgentChat({ agents, configured }: { agents: Agent[]; configured: boolean }) {
  const client = useQueryClient();
  const usable = agents.filter((a) => a.status !== "disabled");
  const [agentId, setAgentId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Set when the user renames the open chat, so auto-save keeps their title.
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  // What the server already has for the open chat; saves are skipped when nothing changed.
  const savedSnapshot = useRef<string>("[]");
  const pendingSave = useRef<{
    id: string;
    title: string;
    agentId: string | null;
    messages: Message[];
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [thinking, setThinking] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const selected = usable.find((a) => a.id === agentId) ?? usable[0];

  const conversations = useQuery({
    queryKey: ["agent-conversations"],
    queryFn: () => conversationsService.list(),
  });

  const flushSave = async () => {
    const next = pendingSave.current;
    if (!next) return;
    pendingSave.current = null;
    try {
      await conversationsService.save(next);
      savedSnapshot.current = JSON.stringify(next.messages);
      void client.invalidateQueries({ queryKey: ["agent-conversations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this chat.");
    }
  };

  // Auto-save the open chat shortly after it changes (new messages, tool results, uploads, approvals).
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (!conversationId || messages.length === 0) return;
    if (JSON.stringify(messages) === savedSnapshot.current) return;
    pendingSave.current = {
      id: conversationId,
      title: customTitle ?? titleFrom(messages),
      agentId: selected?.id ?? null,
      messages,
    };
    const timer = setTimeout(() => void flushSave(), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conversationId, customTitle]);

  // Save anything still pending if the page is closed mid-debounce.
  useEffect(() => {
    const onHide = () => void flushSave();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetThread = () => {
    setMessages([]);
    setConversationId(null);
    setCustomTitle(null);
    savedSnapshot.current = "[]";
    setDraft("");
    setFile(null);
    writeActive(null);
  };

  const startNewChat = async () => {
    await flushSave();
    resetThread();
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const openConversation = async (id: string) => {
    if (id === conversationId) return;
    await flushSave();
    setOpening(true);
    try {
      const chat = await conversationsService.get(id);
      const loaded = chat.messages as Message[];
      savedSnapshot.current = JSON.stringify(loaded);
      setMessages(loaded);
      setConversationId(chat.id);
      const list = conversations.data ?? [];
      const title = list.find((c) => c.id === chat.id)?.title ?? chat.title;
      setCustomTitle(title !== titleFrom(loaded) ? title : null);
      if (chat.agentId && usable.some((a) => a.id === chat.agentId)) setAgentId(chat.agentId);
      setDraft("");
      setFile(null);
      writeActive(chat.id);
    } catch (error) {
      writeActive(null);
      toast.error(error instanceof Error ? error.message : "Could not open this chat.");
      void client.invalidateQueries({ queryKey: ["agent-conversations"] });
    } finally {
      setOpening(false);
    }
  };

  // Reopen the chat this browser had open last; on phones start with the history closed.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setHistoryOpen(false);
    const last = readActive();
    if (last) void openConversation(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renameChat = async (id: string, title: string) => {
    try {
      await conversationsService.rename(id, title);
      if (id === conversationId) setCustomTitle(title);
      await client.invalidateQueries({ queryKey: ["agent-conversations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename this chat.");
    }
  };

  const deleteChat = async (id: string) => {
    if (pendingSave.current?.id === id) pendingSave.current = null;
    await conversationsService.remove(id);
    if (id === conversationId) resetThread();
    toast.success("Chat deleted.");
    await client.invalidateQueries({ queryKey: ["agent-conversations"] });
  };

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const patch = (id: string, change: (m: Message) => Message) =>
    setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)));

  const uploadAttachment = async (messageId: string, attachment: File, steps: Step[]) => {
    const targets = steps.filter(
      (s) => s.tool === "create_release" && s.status === "completed" && s.resultId,
    );
    for (const step of targets) {
      const releaseId = step.resultId!;
      let label = releaseId.slice(0, 8);
      try {
        const input = JSON.parse(step.input) as { platform?: string; channel?: string };
        label = [input.platform, input.channel].filter(Boolean).join(" · ") || label;
      } catch {
        /* keep the id as label */
      }
      const setUpload = (u: Partial<Upload>) =>
        patch(messageId, (m) => ({
          ...m,
          uploads: [
            ...(m.uploads ?? []).filter((x) => x.releaseId !== releaseId),
            {
              releaseId,
              label,
              state: "uploading",
              percent: 0,
              ...(m.uploads ?? []).find((x) => x.releaseId === releaseId),
              ...u,
            },
          ],
        }));
      setUpload({ state: "uploading", percent: 0 });
      try {
        await agentsService.uploadBundle(releaseId, attachment, (_stage, percent) =>
          setUpload({ percent }),
        );
        setUpload({ state: "done", percent: 100 });
      } catch (error) {
        setUpload({
          state: "failed",
          error: error instanceof Error ? error.message : "Upload failed.",
        });
      }
    }
    void client.invalidateQueries({ queryKey: ["releases"] });
  };

  const run = useMutation({
    mutationFn: async (input: {
      text: string;
      attachment: File | null;
      agent: Agent;
      history: Message[];
    }) => {
      const meta = input.attachment
        ? {
            name: input.attachment.name,
            size: input.attachment.size,
            sha256: await agentsService.hashFile(input.attachment),
          }
        : undefined;
      return agentsService.run(input.agent.id, input.text, {
        history: input.history
          .filter((m) => !m.error)
          .map((m) => ({ role: m.role, content: historyText(m).slice(0, 12000) })),
        ...(meta ? { attachment: meta } : {}),
      });
    },
    onSuccess: (result, input) => {
      const id = uid();
      const steps = result.steps as Step[];
      setMessages((all) => [
        ...all,
        { id, role: "assistant", content: result.answer, agentName: input.agent.name, steps },
      ]);
      if (input.attachment) void uploadAttachment(id, input.attachment, steps);
      for (const key of ["agent-approvals", "agent-executions", "releases", "channels", "apps"]) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error, input) =>
      setMessages((all) => [
        ...all,
        {
          id: uid(),
          role: "assistant",
          agentName: input.agent.name,
          error: true,
          content: error instanceof Error ? error.message : "The agent failed.",
        },
      ]),
  });

  useEffect(() => {
    if (!run.isPending) return;
    const timer = setInterval(() => setThinking((n) => (n + 1) % THINKING.length), 1800);
    return () => clearInterval(timer);
  }, [run.isPending]);

  const decide = useMutation({
    mutationFn: (input: {
      messageId: string;
      approvalId: string;
      decision: "approve" | "reject";
    }) => agentsService.decide(input.approvalId, input.decision),
    onSuccess: (_data, input) => {
      patch(input.messageId, (m) => ({
        ...m,
        decisions: {
          ...m.decisions,
          [input.approvalId]: input.decision === "approve" ? "approved" : "rejected",
        },
      }));
      toast.success(input.decision === "approve" ? "Approved and executed." : "Request rejected.");
      void client.invalidateQueries({ queryKey: ["agent-approvals"] });
      void client.invalidateQueries({ queryKey: ["agent-executions"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not complete the action."),
  });

  const commandQuery =
    draft.startsWith("/") && !draft.includes(" ") ? draft.slice(1).toLowerCase() : null;
  const matches = useMemo(
    () => (commandQuery === null ? [] : COMMANDS.filter((c) => c.name.startsWith(commandQuery))),
    [commandQuery],
  );

  const applyCommand = (command: (typeof COMMANDS)[number]) => {
    if (command.name === "clear") {
      void startNewChat();
      return;
    }
    const agent = usable.find((a) => a.key === command.agent);
    if (agent) setAgentId(agent.id);
    setDraft(command.prompt);
    if (command.attach && !file) fileInput.current?.click();
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const send = (text = draft) => {
    const prompt = text.trim();
    if (!prompt || !selected || run.isPending || opening) return;
    // The first message turns a blank thread into a saved chat.
    if (!conversationId) {
      const id = crypto.randomUUID();
      setConversationId(id);
      writeActive(id);
    }
    const history = messages;
    setMessages((all) => [
      ...all,
      {
        id: uid(),
        role: "user",
        content: prompt,
        ...(file ? { attachment: { name: file.name, size: file.size } } : {}),
      },
    ]);
    run.mutate({ text: prompt, attachment: file, agent: selected, history });
    setDraft("");
    setFile(null);
  };

  if (!configured) {
    return (
      <SectionCard>
        <EmptyState
          icon={Bot}
          title="Add an AI provider key first."
          description="Open the AI provider tab and paste a Claude or OpenAI API key."
        />
      </SectionCard>
    );
  }

  // Switching chats mid-answer or mid-upload would attach the result to the wrong thread.
  const busy =
    run.isPending ||
    opening ||
    messages.some((m) => m.uploads?.some((u) => u.state === "uploading"));

  return (
    <div className="relative flex h-[calc(100vh-240px)] min-h-[560px] overflow-hidden rounded-xl border border-border bg-card">
      {/* History sidebar: inline on desktop, an overlay on small screens. */}
      {historyOpen ? (
        <>
          <button
            type="button"
            aria-label="Close chat history"
            className="absolute inset-0 z-20 bg-background/60 md:hidden"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 z-30 w-64 border-r border-border bg-card md:static md:z-auto md:w-60 md:shrink-0 md:bg-surface-2/30">
            <ChatHistory
              conversations={conversations.data ?? []}
              loading={conversations.isPending}
              activeId={conversationId}
              disabled={busy}
              onNew={() => {
                void startNewChat();
                if (window.matchMedia("(max-width: 767px)").matches) setHistoryOpen(false);
              }}
              onSelect={(id) => {
                void openConversation(id);
                if (window.matchMedia("(max-width: 767px)").matches) setHistoryOpen(false);
              }}
              onRename={renameChat}
              onDelete={deleteChat}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: agent picker */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={historyOpen ? "Hide chat history" : "Show chat history"}
            title={historyOpen ? "Hide chat history" : "Show chat history"}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
          <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2/60 p-1">
            {usable.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setAgentId(agent.id)}
                title={agent.description}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] transition-colors",
                  agent.id === selected?.id
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {agent.name}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-[12px]"
            disabled={messages.length === 0 || busy}
            onClick={() => void startNewChat()}
          >
            <Plus /> New chat
          </Button>
        </div>

        {opening ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening chat…
          </div>
        ) : (
          <>
            {/* Thread */}
            <div className="flex-1 overflow-y-auto">
              <div
                className={cn(
                  "mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6",
                  // Empty thread: center the welcome in the available space instead of padding it past the fold.
                  messages.length === 0 && "min-h-full justify-center",
                )}
              >
                {messages.length === 0 ? (
                  <Welcome agent={selected} onPick={applyCommand} />
                ) : (
                  messages.map((message) =>
                    message.role === "user" ? (
                      <UserBubble key={message.id} message={message} />
                    ) : (
                      <AssistantMessage
                        key={message.id}
                        message={message}
                        busy={decide.isPending || run.isPending}
                        onDecide={(approvalId, decision) =>
                          decide.mutate({ messageId: message.id, approvalId, decision })
                        }
                        onFollowUp={(text) => send(text)}
                      />
                    ),
                  )
                )}
                {run.isPending ? (
                  <div className="flex items-start gap-3">
                    <Avatar />
                    <div className="flex items-center gap-2 rounded-2xl bg-surface-2/60 px-4 py-2.5 text-[12px] text-muted-foreground">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </span>
                      {THINKING[thinking]}
                    </div>
                  </div>
                ) : null}
                <div ref={bottom} />
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-background/60 px-4 py-3">
              <div className="relative mx-auto max-w-3xl">
                {matches.length > 0 ? (
                  <ul className="absolute bottom-full left-0 z-10 mb-2 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {matches.map((command, i) => (
                      <li key={command.name}>
                        <button
                          type="button"
                          onMouseEnter={() => setMenuIndex(i)}
                          onClick={() => applyCommand(command)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[12px]",
                            i === menuIndex % matches.length ? "bg-surface-2" : "",
                          )}
                        >
                          <span className="font-mono text-brand">/{command.name}</span>
                          <span className="text-muted-foreground">{command.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-brand/60">
                  {file ? (
                    <div className="flex px-3 pt-3">
                      <span className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-[11px]">
                        <FileArchive className="size-3.5 text-brand" />
                        <span className="font-mono">{file.name}</span>
                        <span className="text-faint">{mb(file.size)}</span>
                        <button
                          type="button"
                          aria-label="Remove attachment"
                          onClick={() => setFile(null)}
                        >
                          <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </span>
                    </div>
                  ) : null}
                  <textarea
                    ref={textarea}
                    rows={1}
                    value={draft}
                    aria-label="Message the agent"
                    placeholder={`Message ${selected?.name ?? "an agent"} — type / for commands`}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setMenuIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (matches.length > 0) {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                          e.preventDefault();
                          setMenuIndex(
                            (i) =>
                              (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) %
                              matches.length,
                          );
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const command = matches[menuIndex % matches.length];
                          if (command) applyCommand(command);
                          return;
                        }
                        if (e.key === "Escape") {
                          setDraft("");
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    className="block max-h-[200px] w-full resize-none bg-transparent px-4 py-3 text-[13px] outline-none placeholder:text-faint"
                  />
                  <div className="flex items-center gap-1 px-2 pb-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".fota"
                      className="hidden"
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        if (picked) setFile(picked);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-full"
                      aria-label="Attach a .fota package"
                      title="Attach a .fota update package"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Paperclip className="size-4" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft("/");
                        textarea.current?.focus();
                      }}
                      className="rounded-full px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    >
                      / commands
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      className="ml-auto size-8 rounded-full"
                      aria-label="Send"
                      disabled={!draft.trim() || run.isPending || !selected}
                      onClick={() => send()}
                    >
                      {run.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-faint">
                  Agents act with your permissions. Risky actions wait for approval. Enter to send ·
                  Shift+Enter for a new line
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
      <Sparkles className="size-3.5" />
    </span>
  );
}

function Welcome({
  agent,
  onPick,
}: {
  agent: Agent | undefined;
  onPick: (c: (typeof COMMANDS)[number]) => void;
}) {
  const picks = (SUGGESTIONS[agent?.key ?? ""] ?? SUGGESTIONS["release-manager"] ?? [])
    .map((name) => COMMANDS.find((c) => c.name === name))
    .filter((c): c is (typeof COMMANDS)[number] => Boolean(c));
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
        <Sparkles className="size-6" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">How can I help with your releases?</h2>
        <p className="max-w-md text-[12px] text-muted-foreground">{agent?.description}</p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {picks.map((command) => (
          <button
            key={command.name}
            type="button"
            onClick={() => onPick(command)}
            className="rounded-xl border border-border p-3 text-left transition-colors hover:border-brand/50 hover:bg-surface-2/40"
          >
            <span className="font-mono text-[11px] text-brand">/{command.name}</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">{command.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {message.attachment ? (
        <span className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]">
          <FileArchive className="size-3.5 text-brand" />
          <span className="font-mono">{message.attachment.name}</span>
          <span className="text-faint">{mb(message.attachment.size)}</span>
        </span>
      ) : null}
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand/10 px-4 py-2.5 text-[13px]">
        {message.content}
      </p>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "completed") return <Check className="size-3 text-success" />;
  if (status === "awaiting_approval") return <Clock className="size-3 text-warning" />;
  return <CircleAlert className="size-3 text-danger" />;
}

function AssistantMessage({
  message,
  busy,
  onDecide,
  onFollowUp,
}: {
  message: Message;
  busy: boolean;
  onDecide: (approvalId: string, decision: "approve" | "reject") => void;
  onFollowUp: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const steps = message.steps ?? [];
  const approvals = steps.filter((s) => s.status === "awaiting_approval" && s.approvalId);
  const ready = (message.uploads ?? []).filter((u) => u.state === "done");

  return (
    <div className="flex items-start gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-[11px] font-medium text-muted-foreground">{message.agentName}</p>

        {steps.length > 0 ? (
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Wrench className="size-3.5" />
              Used {steps.length} {steps.length === 1 ? "tool" : "tools"}
              <span className="flex flex-wrap gap-1">
                {steps.slice(0, 4).map((s, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded bg-surface-2/70 px-1.5 py-0.5"
                  >
                    <StepIcon status={s.status} />
                    {TOOL_LABELS[s.tool] ?? s.tool}
                  </span>
                ))}
                {steps.length > 4 ? <span>+{steps.length - 4}</span> : null}
              </span>
              <ChevronDown
                className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")}
              />
            </button>
            {open ? (
              <ol className="space-y-1 border-t border-border px-3 py-2">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 font-mono text-[10px]">
                    <StepIcon status={s.status} />
                    <span>{s.tool}</span>
                    <span className="truncate text-faint" title={s.input}>
                      {s.input}
                    </span>
                    <span className="ml-auto shrink-0 text-muted-foreground">{s.summary}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "text-[13px]",
            message.error && "rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-danger",
          )}
        >
          {message.error ? (
            <p>{message.content}</p>
          ) : (
            <Markdown text={message.content} className="text-[13px]" />
          )}
        </div>

        {approvals.map((step) => {
          const decided = message.decisions?.[step.approvalId!];
          let detail = step.input;
          try {
            const input = JSON.parse(step.input) as { reason?: string };
            detail = input.reason ?? detail;
          } catch {
            /* show raw input */
          }
          return (
            <div
              key={step.approvalId}
              className="rounded-xl border border-warning/40 bg-warning/5 p-3"
            >
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <ShieldCheck className="size-4 text-warning" />
                Approval needed: {TOOL_LABELS[step.tool] ?? step.tool}
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">{detail}</p>
              {decided ? (
                <p
                  className={cn(
                    "mt-2 text-[11px] font-medium",
                    decided === "approved" ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {decided === "approved" ? "Approved and executed." : "Rejected."}
                </p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <ConfirmAction
                    trigger={
                      <Button size="sm" disabled={busy}>
                        Approve
                      </Button>
                    }
                    title="Approve this agent action"
                    description="The action runs immediately with your permissions."
                    confirmLabel="Approve action"
                    destructive={[
                      "publish_release",
                      "rollback_release",
                      "promote_release",
                      "revoke_api_key",
                    ].includes(step.tool)}
                    details={[
                      { label: "Action", value: TOOL_LABELS[step.tool] ?? step.tool },
                      { label: "Input", value: step.input },
                    ]}
                    onConfirm={async () => {
                      onDecide(step.approvalId!, "approve");
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onDecide(step.approvalId!, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {(message.uploads ?? []).map((upload) => (
          <div key={upload.releaseId} className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 text-[12px]">
              {upload.state === "uploading" ? (
                <Loader2 className="size-4 animate-spin text-brand" />
              ) : upload.state === "done" ? (
                <Check className="size-4 text-success" />
              ) : (
                <CircleAlert className="size-4 text-danger" />
              )}
              <span className="font-medium">
                {upload.state === "uploading"
                  ? "Uploading package"
                  : upload.state === "done"
                    ? "Package uploaded — release ready"
                    : "Upload failed"}
              </span>
              <span className="font-mono text-[11px] text-faint">{upload.label}</span>
            </div>
            {upload.state === "uploading" ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${upload.percent}%` }}
                />
              </div>
            ) : null}
            {upload.error ? <p className="mt-1 text-[11px] text-danger">{upload.error}</p> : null}
          </div>
        ))}

        {!message.error ? (
          <div className="flex flex-wrap items-center gap-2">
            {ready.length > 0 ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full text-[11px]"
                  disabled={busy}
                  onClick={() =>
                    onFollowUp(
                      `The package is uploaded. Publish release${ready.length > 1 ? "s" : ""} ${ready.map((u) => u.releaseId).join(", ")} at 10% rollout.`,
                    )
                  }
                >
                  Publish at 10%
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full text-[11px]"
                  disabled={busy}
                  onClick={() =>
                    onFollowUp(
                      `The package is uploaded. Publish release${ready.length > 1 ? "s" : ""} ${ready.map((u) => u.releaseId).join(", ")} at 100% rollout.`,
                    )
                  }
                >
                  Publish at 100%
                </Button>
              </>
            ) : null}
            <button
              type="button"
              aria-label="Copy answer"
              title="Copy"
              onClick={() => {
                void navigator.clipboard
                  .writeText(message.content)
                  .then(() => toast.success("Copied."));
              }}
              className="rounded p-1 text-faint hover:bg-surface-2 hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
