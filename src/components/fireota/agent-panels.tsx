/** Agents page panels: bring-your-own AI key and per-tool permissions (chat lives in agent-chat). */
import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { SectionCard, SkeletonRows } from "@/components/fireota/primitives";
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
      toast.error(friendlyError(error, "Could not save the key.")),
  });
  const remove = useMutation({
    mutationFn: () => agentsService.removeSettings(),
    onSuccess: () => {
      toast.success("AI key removed. Agents are off until you add one.");
      void client.invalidateQueries({ queryKey: ["agent-settings"] });
    },
    onError: (error) =>
      toast.error(friendlyError(error, "Could not remove the key.")),
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
      toast.error(friendlyError(error, "Could not change the permission.")),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => agentsService.setEnabled(agent.id, enabled),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["agents"] }),
    onError: (error) =>
      toast.error(friendlyError(error, "Could not update the agent.")),
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
