import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  EmptyState,
  EnvBadge,
  PageHeader,
  SectionCard,
  SkeletonRows,
} from "@/components/fireota/primitives";
import { AgentChat } from "@/components/fireota/agent-chat";
import { AgentToolModes, ProviderSettings } from "@/components/fireota/agent-panels";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import { agentsService } from "@/services";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — FireOTA" },
      {
        name: "description",
        content: "Automation agents that watch rollouts, propose actions and request human approval before acting.",
      },
      { property: "og:title", content: "Agents — FireOTA" },
      { property: "og:description", content: "Human-approved automation for OTA release operations." },
    ],
  }),
  component: AgentsPage,
});


const riskTone: Record<string, string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-danger",
};

function AgentsPage() {
  const client = useQueryClient();
  const agents = useQuery(q.agents());
  const executions = useQuery(q.agentExecutions());
  const approvals = useQuery(q.agentApprovals());
  const settings = useQuery(q.agentSettings());
  const { can } = usePermissions();
  const configured = Boolean(settings.data?.configured);
  const [tab, setTab] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) => agentsService.decide(id, decision),
    onSuccess: (_data, variables) => {
      toast.success(variables.decision === "approve" ? "Action approved and executed." : "Request rejected.");
      void client.invalidateQueries({ queryKey: ["agent-approvals"] });
      void client.invalidateQueries({ queryKey: ["agent-executions"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not complete the action."),
  });

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Agents" }]}>
      <PageHeader
        title="Agents"
        description="AI teammates that deploy, review and watch for malicious activity — on your own Claude or OpenAI key, with human approval for anything risky."
      />

      <Tabs value={tab ?? (configured ? "run" : "provider")} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="run">Chat</TabsTrigger>
          <TabsTrigger value="approvals">Approvals{approvals.data?.length ? ` (${approvals.data.length})` : ""}</TabsTrigger>
          <TabsTrigger value="agents">Agents & permissions</TabsTrigger>
          <TabsTrigger value="executions">History</TabsTrigger>
          <TabsTrigger value="provider">AI provider</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="mt-3">
          <AgentChat agents={agents.data ?? []} configured={configured} />
        </TabsContent>

        <TabsContent value="provider" className="mt-3">
          <ProviderSettings canManage={can("agent.manage")} />
        </TabsContent>

        <TabsContent value="approvals" className="mt-3 space-y-3">
          {approvals.isLoading ? (
            <SectionCard>
              <SkeletonRows rows={2} cols={3} />
            </SectionCard>
          ) : (approvals.data ?? []).length === 0 ? (
            <SectionCard>
              <EmptyState icon={Bot} title="Nothing waiting for approval." description="Agents will ask here before acting." />
            </SectionCard>
          ) : (
            (approvals.data ?? []).map((approval) => (
              <SectionCard
                key={approval.id}
                title={
                  <span className="flex items-center gap-2">
                    {approval.agentName}
                    <EnvBadge environment={approval.environment} />
                  </span>
                }
                aside={
                  <span className={`font-mono text-[10px] ${riskTone[approval.risk]}`}>
                    {approval.risk.toUpperCase()} RISK · {approval.requestedAt}
                  </span>
                }
              >
                <div className="space-y-3 p-4">
                  <p className="text-[12px] font-medium">{approval.requestedAction}</p>
                  <p className="text-[12px] text-muted-foreground">{approval.reasoning}</p>
                  <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-[11px]">
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Application</dt>
                      <dd>{approval.appName}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Release</dt>
                      <dd className="font-mono">{approval.releaseLabel}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Channel</dt>
                      <dd className="font-mono">{approval.channelName}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <ConfirmAction
                      trigger={<Button size="sm">Approve</Button>}
                      title="Approve this agent action"
                      description="The agent executes the proposed action immediately after approval."
                      warning={
                        approval.environment === "production"
                          ? "This action affects production devices."
                          : undefined
                      }
                      confirmLabel="Approve action"
                      destructive={approval.risk === "high"}
                      {...(approval.environment === "production" ? { requireTyped: "APPROVE" } : {})}
                      details={[
                        { label: "Agent", value: approval.agentName },
                        { label: "Action", value: approval.requestedAction },
                        { label: "Application", value: approval.appName },
                      ]}
                      onConfirm={async () => {
                        await decide.mutateAsync({ id: approval.id, decision: "approve" });
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => decide.mutate({ id: approval.id, decision: "reject" })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-3">
          {(agents.data ?? []).length === 0 ? (
            <SectionCard>
              <EmptyState icon={Bot} title="No agents yet." description="Agents appear once an admin adds an AI provider key." />
            </SectionCard>
          ) : null}
          <div className="grid gap-3 xl:grid-cols-3">
            {(agents.data ?? []).map((agent) => (
              <AgentToolModes key={agent.id} agent={agent} canManage={can("agent.manage")} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="executions" className="mt-3">
          <SectionCard title="Execution history">
            {executions.isLoading ? (
              <SkeletonRows rows={4} cols={4} />
            ) : (
              <ul className="divide-y divide-border">
                {(executions.data ?? []).map((execution) => (
                  <li key={execution.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-[12px]">
                    <span className="font-medium">{execution.agentName}</span>
                    <span className="text-muted-foreground">{execution.action}</span>
                    <span className="font-mono text-[11px]">{execution.appName}</span>
                    <span className="font-mono text-[11px] text-faint">{execution.releaseLabel}</span>
                    <span
                      className={`font-mono text-[10px] ${
                        execution.status === "completed"
                          ? "text-success"
                          : execution.status === "failed"
                            ? "text-danger"
                            : "text-warning"
                      }`}
                    >
                      {execution.status.replace("_", " ").toUpperCase()}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-faint">
                      {execution.started} → {execution.completed ?? "running"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

      </Tabs>
    </AppShell>
  );
}
