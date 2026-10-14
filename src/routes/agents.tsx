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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const modeTone: Record<string, string> = {
  allowed: "text-success",
  denied: "text-danger",
  requires_approval: "text-warning",
};

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
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; sources: string[] } | null>(null);

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) => agentsService.decide(id, decision),
    onSuccess: (_data, variables) => {
      toast.success(variables.decision === "approve" ? "Action approved and executed." : "Request rejected.");
      void client.invalidateQueries({ queryKey: ["agent-approvals"] });
      void client.invalidateQueries({ queryKey: ["agent-executions"] });
    },
  });

  const ask = useMutation({
    mutationFn: () => agentsService.ask(question),
    onSuccess: (result) => setAnswer({ answer: result.answer, sources: result.sources }),
  });

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Agents" }]}>
      <PageHeader
        title="Agents"
        description="Agents observe and propose. Anything that touches production waits for a human."
      />

      <Tabs defaultValue="approvals">
        <TabsList>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="ask">Ask</TabsTrigger>
        </TabsList>

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
          <div className="grid gap-3 xl:grid-cols-2">
            {(agents.data ?? []).map((agent) => (
              <SectionCard
                key={agent.id}
                title={agent.name}
                aside={
                  <span
                    className={`font-mono text-[10px] ${
                      agent.status === "enabled" ? "text-success" : agent.status === "available" ? "text-warning" : "text-faint"
                    }`}
                  >
                    {agent.status.replace("_", " ").toUpperCase()}
                  </span>
                }
              >
                <div className="space-y-3 p-4">
                  <p className="text-[12px] text-muted-foreground">{agent.description}</p>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Capabilities</p>
                    <ul className="mt-1 space-y-0.5">
                      {agent.capabilities.map((capability) => (
                        <li key={capability} className="text-[11px]">
                          {capability}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Tool permissions</p>
                    <ul className="mt-1 space-y-0.5">
                      {agent.permissions.map((permission) => (
                        <li key={permission.tool} className="flex items-center gap-2 font-mono text-[11px]">
                          <span>{permission.tool}</span>
                          <span className={`ml-auto text-[10px] ${modeTone[permission.mode]}`}>
                            {permission.mode.replace("_", " ").toUpperCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">{agent.approvalPolicy}</p>
                  <p className="font-mono text-[10px] text-faint">
                    last execution {agent.lastExecution ?? "never"}
                  </p>
                </div>
              </SectionCard>
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

        <TabsContent value="ask" className="mt-3">
          <SectionCard title="Ask about your releases">
            <div className="space-y-3 p-4">
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (question.trim()) ask.mutate();
                }}
              >
                <Input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Why was release #56 rolled back?"
                  aria-label="Question about your releases"
                  className="h-9 min-w-[240px] flex-1 text-[12px]"
                />
                <Button size="sm" type="submit" disabled={!question.trim() || ask.isPending}>
                  {ask.isPending ? "Thinking…" : "Ask"}
                </Button>
              </form>
              {answer ? (
                <div className="rounded-md border border-border bg-surface-2/40 p-3">
                  <p className="text-[12px]">{answer.answer}</p>
                  <p className="mt-2 font-mono text-[10px] text-faint">sources: {answer.sources.join(", ")}</p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Answers are grounded in your release, rollout and audit data — never invented.
                </p>
              )}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
