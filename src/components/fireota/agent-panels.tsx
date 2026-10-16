/** Agents page panels: bring-your-own AI key, running an agent, and per-tool permissions. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, KeyRound, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { EmptyState, SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { q } from "@/lib/queries";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { agentsService } from "@/services";

const MODES = [
  { value: "allowed", label: "Allowed", tone: "text-success" },
  { value: "requires_approval", label: "Needs approval", tone: "text-warning" },
  { value: "denied", label: "Denied", tone: "text-danger" },
] as const;

export function ProviderSettings({ canManage }: { canManage: boolean }) {
  const client = useQueryClient();
  const settings = useQuery(q.agentSettings());
  const [provider, setProvider] = useState<"anthropic" | "openai" | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const current = settings.data;
  const effectiveProvider = provider ?? current?.provider ?? "anthropic";
  const effectiveModel =
    model ??
    (provider && provider !== current?.provider
      ? provider === "anthropic"
        ? "claude-opus-5-5"
        : ""
      : (current?.model ?? "claude-opus-5-5"));

  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      agentsService.saveSettings({
        provider: effectiveProvider,
        model: effectiveModel,
        enabled,
        ...(apiKey ? { apiKey } : {}),
      }),
    onSuccess: () => {
      toast.success("AI provider verified and saved. Your agents are ready.");
      setApiKey("");
      setProvider(null);
      setModel(null);
      void client.invalidateQueries({ queryKey: ["agent-settings"] });
      void client.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the key."),
  });
  const remove = useMutation({
    mutationFn: () => agentsService.removeSettings(),
    onSuccess: () => {
      toast.success("AI key removed. Agents are off until you add one.");
      void client.invalidateQueries({ queryKey: ["agent-settings"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove the key."),
  });

  if (settings.isLoading) {
    return (
      <SectionCard title="AI provider">
        <SkeletonRows rows={3} cols={2} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-4" /> AI provider (bring your own key)
        </span>
      }
      aside={
        <span
          className={cn(
            "font-mono text-[10px]",
            current?.configured ? "text-success" : "text-faint",
          )}
        >
          {current?.configured
            ? `${current.provider} · ${current.model} · key ${current.keyHint}`
            : "not configured"}
        </span>
      }
    >
      <div className="space-y-4 p-4 text-[12px]">
        <p className="text-muted-foreground">
          Agents run on <strong>your</strong> Claude or OpenAI account — you pay the provider
          directly. The key is verified, stored encrypted (AES-256-GCM) and never shown again or
          sent to the browser. Agents can only do what the person asking is allowed to do, and write
          actions wait for approval unless an admin allows them.
        </p>
        {canManage ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Provider">
                <Select
                  value={effectiveProvider}
                  onValueChange={(v) => {
                    setProvider(v as "anthropic" | "openai");
                    setModel(null);
                  }}
                >
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Model">
                {effectiveProvider === "anthropic" ? (
                  <Select value={effectiveModel} onValueChange={setModel}>
                    <SelectTrigger className="h-9 font-mono text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(current?.claudeModels ?? ["claude-opus-5-5"]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={effectiveModel}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="model name from your OpenAI account"
                    className="h-9 font-mono text-[12px]"
                  />
                )}
              </Field>
              <Field
                label={
                  current?.configured && effectiveProvider === current.provider
                    ? "New API key (optional)"
                    : "API key"
                }
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={effectiveProvider === "anthropic" ? "sk-ant-…" : "sk-…"}
                  className="h-9 font-mono text-[12px]"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={
                  save.isPending ||
                  !effectiveModel ||
                  (!apiKey && (!current?.configured || effectiveProvider !== current.provider))
                }
                onClick={() => save.mutate(true)}
              >
                {save.isPending ? <Loader2 className="animate-spin" /> : null} Verify and save
              </Button>
              {current?.configured ? (
                <>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={current.enabled}
                      disabled={save.isPending}
                      onCheckedChange={(enabled) => save.mutate(enabled)}
                    />
                    Agents enabled
                  </label>
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="ghost" className="ml-auto text-danger">
                        Remove key
                      </Button>
                    }
                    title="Remove the AI provider key"
                    description="Agents stop working until a new key is added. Approval requests already created stay."
                    confirmLabel="Remove key"
                    destructive
                    onConfirm={async () => {
                      await remove.mutateAsync();
                    }}
                  />
                </>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Ask an admin to add the workspace's AI key.</p>
        )}
      </div>
    </SectionCard>
  );
}

const EXAMPLES: Record<string, string[]> = {
  "release-manager": [
    "Move the latest production update to 25% if its failure rate is under 1%.",
    "Promote the newest beta update to production at 10%.",
  ],
  "release-reviewer": [
    "Review every update published this week and tell me which ones are risky.",
    "Is the current production update healthy?",
  ],
  "security-sentinel": [
    "Investigate today's open security alerts.",
    "Do any API keys look leaked or unused? Recommend what to revoke.",
  ],
};

export function RunAgentPanel({ agents, configured }: { agents: Agent[]; configured: boolean }) {
  const client = useQueryClient();
  const usable = agents.filter((a) => a.status !== "disabled");
  const [agentId, setAgentId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<
    {
      prompt: string;
      agent: string;
      answer: string;
      steps: { tool: string; input: string; status: string; summary: string }[];
    }[]
  >([]);
  const selected = usable.find((a) => a.id === agentId) ?? usable[0];

  const run = useMutation({
    mutationFn: () => agentsService.run(selected!.id, prompt),
    onSuccess: (result) => {
      setHistory((h) => [
        { prompt, agent: selected?.name ?? "", answer: result.answer, steps: result.steps },
        ...h,
      ]);
      setPrompt("");
      void client.invalidateQueries({ queryKey: ["agent-approvals"] });
      void client.invalidateQueries({ queryKey: ["agent-executions"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The agent failed."),
  });

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

  return (
    <div className="space-y-3">
      <SectionCard title="Ask an agent to do something">
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim().length >= 3 && selected) run.mutate();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <Select value={selected?.id ?? ""} onValueChange={setAgentId}>
              <SelectTrigger className="h-9 w-[220px] text-[12px]" aria-label="Agent">
                <SelectValue placeholder="Choose an agent" />
              </SelectTrigger>
              <SelectContent>
                {usable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="self-center text-[11px] text-muted-foreground">{selected?.description}</p>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={15}
            placeholder="What should the agent do?"
            className="text-[12px]"
            aria-label="Request"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(EXAMPLES[selected?.key ?? ""] ?? []).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-brand/50 hover:text-foreground"
              >
                {example}
              </button>
            ))}
            <Button
              size="sm"
              type="submit"
              className="ml-auto"
              disabled={run.isPending || prompt.trim().length < 3 || !selected}
            >
              {run.isPending ? <Loader2 className="animate-spin" /> : <Send />}{" "}
              {run.isPending ? "Working…" : "Run"}
            </Button>
          </div>
        </form>
      </SectionCard>

      {history.map((entry, index) => (
        <SectionCard
          key={`${index}-${entry.prompt}`}
          title={entry.agent}
          aside={
            <span className="font-mono text-[10px] text-faint">
              {entry.steps.length} tool calls
            </span>
          }
        >
          <div className="space-y-3 p-4 text-[12px]">
            <p className="rounded-md bg-surface-2/50 p-2 text-muted-foreground">“{entry.prompt}”</p>
            {entry.steps.length > 0 ? (
              <ol className="space-y-1">
                {entry.steps.map((step, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span>{step.tool}</span>
                    <span
                      className={cn(
                        "text-[10px]",
                        step.status === "completed"
                          ? "text-success"
                          : step.status === "awaiting_approval"
                            ? "text-warning"
                            : "text-danger",
                      )}
                    >
                      {step.status.replace("_", " ")}
                    </span>
                    <span className="truncate text-faint" title={step.input}>
                      {step.input}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="whitespace-pre-wrap leading-relaxed">{entry.answer}</p>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

export function AgentToolModes({ agent, canManage }: { agent: Agent; canManage: boolean }) {
  const client = useQueryClient();
  const setMode = useMutation({
    mutationFn: ({
      tool,
      mode,
    }: {
      tool: string;
      mode: "allowed" | "requires_approval" | "denied";
    }) => agentsService.setToolMode(agent.id, tool, mode),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["agents"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not change the permission."),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => agentsService.setEnabled(agent.id, enabled),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["agents"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update the agent."),
  });
  return (
    <SectionCard
      title={agent.name}
      aside={
        canManage ? (
          <label className="flex items-center gap-2 text-[11px]">
            <Switch
              checked={agent.status !== "disabled"}
              onCheckedChange={(v) => toggle.mutate(v)}
              aria-label={`Enable ${agent.name}`}
            />
            {agent.status === "disabled" ? "Off" : "On"}
          </label>
        ) : (
          <span className="font-mono text-[10px] text-faint">{agent.status.toUpperCase()}</span>
        )
      }
    >
      <div className="space-y-3 p-4">
        <p className="text-[12px] text-muted-foreground">{agent.description}</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {agent.permissions.map((permission) => (
            <li key={permission.tool} className="flex items-center gap-2 px-3 py-1.5">
              <span className="font-mono text-[11px]">{permission.tool}</span>
              {canManage ? (
                <Select
                  value={permission.mode}
                  onValueChange={(mode) =>
                    setMode.mutate({
                      tool: permission.tool,
                      mode: mode as (typeof MODES)[number]["value"],
                    })
                  }
                >
                  <SelectTrigger
                    className="ml-auto h-7 w-[150px] text-[11px]"
                    aria-label={`Mode for ${permission.tool}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={cn(
                    "ml-auto font-mono text-[10px]",
                    MODES.find((m) => m.value === permission.mode)?.tone,
                  )}
                >
                  {permission.mode.replace("_", " ").toUpperCase()}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="font-mono text-[10px] text-faint">
          last run {agent.lastExecution ?? "never"}
        </p>
      </div>
    </SectionCard>
  );
}
