import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Play } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import {
  EmptyState,
  EnvBadge,
  PageHeader,
  PlatformTag,
  RolloutBar,
  SectionCard,
  SkeletonRows,
  StatCard,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/rollouts/")({
  head: () => ({
    meta: [
      { title: "Rollouts — FireOTA" },
      {
        name: "description",
        content: "Monitor and control staged OTA rollouts: adoption, failure rates and automatic rollback thresholds.",
      },
      { property: "og:title", content: "Rollouts — FireOTA" },
      { property: "og:description", content: "Monitor and control staged OTA rollouts in real time." },
    ],
  }),
  component: RolloutsPage,
});

function RolloutsPage() {
  const rollouts = useQuery(q.rollouts());
  const rows = rollouts.data ?? [];
  const active = rows.filter((r) => r.status === "active").length;
  const paused = rows.filter((r) => r.status === "paused").length;
  const devices = rows.reduce((sum, r) => sum + r.devices, 0);

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Rollouts" }]}>
      <PageHeader title="Rollouts" description="Staged rollouts currently in flight across your applications." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Active rollouts" value={active} />
        <StatCard label="Paused" value={paused} hint={paused > 0 ? "needs attention" : "none"} />
        <StatCard label="Devices in rollout" value={devices.toLocaleString()} />
        <StatCard
          label="Average adoption"
          value={`${rows.length ? Math.round(rows.reduce((s, r) => s + r.adoption, 0) / rows.length) : 0}%`}
          accent
        />
      </div>

      {rollouts.isLoading ? (
        <SectionCard>
          <SkeletonRows rows={4} cols={4} />
        </SectionCard>
      ) : rows.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Play}
            title="No rollouts in flight."
            description="Publish a release with a partial rollout to see it here."
            actions={
              <Button size="sm" asChild>
                <Link to="/releases">View releases</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((rollout) => (
            <SectionCard
              key={rollout.id}
              title={
                <Link to="/rollouts/$rolloutId" params={{ rolloutId: rollout.id }} className="hover:text-brand">
                  {rollout.appName} · {rollout.releaseLabel}
                </Link>
              }
              aside={
                <span className="flex items-center gap-2">
                  <EnvBadge environment={rollout.environment} />
                  <PlatformTag platform={rollout.platform} />
                </span>
              }
            >
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-mono">{rollout.channelName}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      rollout.status === "paused" ? "text-warning" : rollout.status === "completed" ? "text-faint" : "text-success"
                    }`}
                  >
                    {rollout.status.toUpperCase()} · started {rollout.startedAt}
                  </span>
                </div>
                <RolloutBar value={rollout.current} tone={rollout.status === "paused" ? "warning" : "brand"} />
                <dl className="grid grid-cols-2 gap-y-2 border-t border-border pt-3 text-[11px] sm:grid-cols-4">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Target</dt>
                    <dd className="font-mono">{rollout.target}%</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Adoption</dt>
                    <dd className="font-mono">{rollout.adoption}%</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Success</dt>
                    <dd className="font-mono text-success">{rollout.successRate}%</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Failures</dt>
                    <dd className={`font-mono ${rollout.failures > 0 ? "text-danger" : ""}`}>{rollout.failures}</dd>
                  </div>
                </dl>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" asChild>
                  <Link to="/rollouts/$rolloutId" params={{ rolloutId: rollout.id }}>
                    Manage rollout
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
