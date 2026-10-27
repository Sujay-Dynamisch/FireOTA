import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SkeletonRows,
  StatCard,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { securityService } from "@/services";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — FireOTA" },
      {
        name: "description",
        content: "Suspicious and risky activity detected in your FireOTA workspace.",
      },
    ],
  }),
  component: SecurityPage,
});

const severityTone = {
  high: "border-danger/40 bg-danger/10 text-danger",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-border bg-surface-2/60 text-muted-foreground",
};

const RULES: [string, string][] = [
  [
    "Destructive bursts",
    "5 or more deletions, rollbacks, revocations or removals by one actor within 10 minutes.",
  ],
  ["Leaked keys", "A revoked or expired API key is used, or a key is used from a new IP address."],
  [
    "Privilege changes",
    "Someone is made owner/admin, invited as admin, or a full-access (*) API key is created.",
  ],
  [
    "Supply-chain integrity",
    "Uploads with a wrong checksum or an invalid code signature; code signing turned off.",
  ],
  ["Risky releases", "A production update published straight to 100% with no staged rollout."],
  [
    "Agent abuse",
    "Prompt-injection attempts, instruction-like text in workspace data, agents using tools they may not use.",
  ],
];

function SecurityPage() {
  const client = useQueryClient();
  const { can, loading } = usePermissions();
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const allowed = can("security.read");
  const events = useQuery({ ...q.security(status), enabled: allowed });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "open" | "resolved" }) =>
      securityService.setStatus(id, next),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["security"] }),
    onError: (error) =>
      toast.error(friendlyError(error, "Could not update the alert.")),
  });

  if (!loading && !allowed) {
    return (
      <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Security" }]}>
        <ErrorState title="No access" description="Your role cannot view security alerts." />
      </AppShell>
    );
  }

  const list = events.data ?? [];
  const open = list.filter((e) => e.status === "open");
  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Security" }]}>
      <PageHeader
        title="Security"
        description="FireOTA watches your workspace for malicious or risky activity and raises alerts here, in notifications and to `security.alert` webhooks."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/agents">Investigate with the Security sentinel agent</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Open alerts" value={status === "resolved" ? "—" : open.length} accent />
        <StatCard label="High severity" value={open.filter((e) => e.severity === "high").length} />
        <StatCard label="Medium" value={open.filter((e) => e.severity === "medium").length} />
        <StatCard label="Low" value={open.filter((e) => e.severity === "low").length} />
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <SectionCard title="Alerts">
        {events.isLoading ? (
          <SkeletonRows rows={4} cols={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing suspicious."
            description="No alerts match this filter."
            compact
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((event) => (
              <li key={event.id} className="flex flex-wrap items-start gap-3 p-4">
                <ShieldAlert
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    event.severity === "high"
                      ? "text-danger"
                      : event.severity === "medium"
                        ? "text-warning"
                        : "text-faint",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    {event.title}
                    <span
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase",
                        severityTone[event.severity],
                      )}
                    >
                      {event.severity}
                    </span>
                    <span className="font-mono text-[10px] text-faint">{event.kind}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {event.actor || "unknown actor"}
                    {event.ip ? ` · ${event.ip}` : ""} · {event.at} ({event.ago})
                  </p>
                  {event.details !== "{}" ? (
                    <code className="mt-1 block break-all font-mono text-[10px] text-faint">
                      {event.details}
                    </code>
                  ) : null}
                </div>
                {can("security.manage") ? (
                  <Button
                    size="sm"
                    variant={event.status === "open" ? "outline" : "ghost"}
                    className="h-7 text-[11px]"
                    disabled={update.isPending}
                    loading={update.isPending && update.variables?.id === event.id}
                    onClick={() =>
                      update.mutate({
                        id: event.id,
                        next: event.status === "open" ? "resolved" : "open",
                      })
                    }
                  >
                    {event.status === "open" ? "Mark resolved" : "Reopen"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="What FireOTA detects">
        <dl className="grid gap-3 p-4 text-[12px] sm:grid-cols-2">
          {RULES.map(([title, copy]) => (
            <div key={title}>
              <dt className="font-medium">{title}</dt>
              <dd className="text-muted-foreground">{copy}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </AppShell>
  );
}
