import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Boxes, Database, LineChart, Play } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import {
  ActivityFeed,
  EmptyState,
  EnvBadge,
  Label,
  PageHeader,
  PlatformTag,
  RolloutBar,
  SectionCard,
  SkeletonBlock,
  SkeletonRows,
  StatCard,
  StatusBadge,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { q } from "@/lib/queries";
import { dashboardService } from "@/services";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FireOTA" },
      { name: "description", content: "Release health, active rollouts and recent OTA activity across your React Native applications." },
      { property: "og:title", content: "Dashboard — FireOTA" },
      { property: "og:description", content: "Release health, active rollouts and recent OTA activity in one view." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const summary = useQuery(q.dashboard());
  const apps = useQuery(q.apps());
  const releases = useQuery(q.releases());
  const rollouts = useQuery(q.rollouts());
  const activity = useQuery(q.activity());

  const hasApps = (apps.data ?? []).length > 0;
  const firstAppId = apps.data?.[0]?.id;
  const firebase = summary.data?.firebase;
  const firebaseConnected = Boolean(firebase?.name);
  const firebaseHealthy = firebase?.status === "connected";
  const apiKeys = useQuery({ ...q.apiKeys(), retry: false });
  const hasPublished = (releases.data ?? []).some((r) => ["published", "paused", "rolled_back", "archived"].includes(r.status));
  const hasApiKey = (apiKeys.data ?? []).length > 0;

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Dashboard" }]}>
      <PageHeader
        title={`${dashboardService.greeting()}, ${summary.data?.greetingName ?? "there"}`}
        description="Here's what's happening across your React Native applications."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/apps/new">Add App</Link>
            </Button>
            {firstAppId ? (
              <Button size="sm" asChild>
                <Link to="/apps/$appId/releases/new" params={{ appId: firstAppId }}>
                  Create Release
                </Link>
              </Button>
            ) : (
              <Button size="sm" disabled title="Add an application first">
                Create Release
              </Button>
            )}
          </>
        }
      />

      {!apps.isLoading && !summary.isLoading && !hasApps ? (
        <SectionCard>
          {firebaseConnected ? (
            <EmptyState
              icon={Boxes}
              title="Firebase is connected. Add your first app."
              description={`Register a React Native application to start publishing OTA releases to ${firebase?.name}.`}
              actions={
                <>
                  <Button size="sm" asChild>
                    <Link to="/apps/new">Add Application</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/projects">Manage projects</Link>
                  </Button>
                </>
              }
            />
          ) : (
            <EmptyState
              icon={Boxes}
              title="Your OTA workspace is empty."
              description="Connect Firebase and add your first React Native application."
              actions={
                <>
                  <Button size="sm" asChild>
                    <Link to="/projects/connect">Connect Firebase</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/apps/new">Add Application</Link>
                  </Button>
                </>
              }
            />
          )}
        </SectionCard>
      ) : null}

      {/* Firebase connection banner */}
      {summary.data && firebase && firebaseConnected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/50 px-4 py-2.5">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${firebaseHealthy ? "bg-success" : "bg-warning"}`} />
          <span className="font-mono text-[11px] text-muted-foreground">FIREBASE</span>
          <span className="text-[12px] font-medium">{firebase.name}</span>
          <span className="font-mono text-[10px] text-faint">
            storage {firebase.storage ? "✓" : "✗"} · firestore {firebase.firestore ? "✓" : "✗"} · permissions{" "}
            {firebase.permissions ? "✓" : "✗"} · {firebase.status}
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-[11px]" asChild>
            <Link to="/projects">Manage projects</Link>
          </Button>
        </div>
      ) : summary.isLoading ? (
        <SkeletonBlock className="h-11" />
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summary.isLoading || !summary.data ? (
          <>
            <SkeletonBlock className="h-[92px]" />
            <SkeletonBlock className="h-[92px]" />
            <SkeletonBlock className="h-[92px]" />
            <SkeletonBlock className="h-[92px]" />
          </>
        ) : (
          <>
            <StatCard label="Applications" value={summary.data.stats.apps} hint="1 in setup" icon={Boxes} />
            <StatCard
              label="Production Releases"
              value={summary.data.stats.productionReleases}
              hint="6 active channels"
              icon={Activity}
            />
            <StatCard label="Active Rollouts" value={summary.data.stats.activeRollouts} hint="1 paused" icon={Play} />
            <StatCard
              label="Update Success Rate"
              value={`${summary.data.stats.successRate}%`}
              icon={LineChart}
              accent
              progress={summary.data.stats.successRate}
            />
          </>
        )}
      </div>

      {/* Release health + activity */}
      <div className="grid items-start gap-3 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Release health"
          aside={<span className="font-mono text-[10px] text-faint">last 7 days</span>}
        >
          {summary.data ? (
            <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
              <div className="p-3.5">
                <div className="text-[11px] text-muted-foreground">Adoption</div>
                <div className="mt-1 font-display text-[20px] font-bold tracking-tight">{summary.data.health.adoption}%</div>
                <RolloutBar value={summary.data.health.adoption} tone="neutral" showValue={false} className="mt-2" />
              </div>
              <div className="p-3.5">
                <div className="text-[11px] text-muted-foreground">Successful updates</div>
                <div className="mt-1 font-display text-[20px] font-bold tracking-tight text-success">
                  {summary.data.health.successful.toLocaleString()}
                </div>
                <RolloutBar value={98} tone="success" showValue={false} className="mt-2" />
              </div>
              <div className="p-3.5">
                <div className="text-[11px] text-muted-foreground">Failed updates</div>
                <div className="mt-1 font-display text-[20px] font-bold tracking-tight text-danger">
                  {summary.data.health.failed}
                </div>
                <RolloutBar value={2} tone="danger" showValue={false} className="mt-2" />
              </div>
              <div className="p-3.5">
                <div className="text-[11px] text-muted-foreground">Rollback events</div>
                <div className="mt-1 font-display text-[20px] font-bold tracking-tight text-warning">
                  {summary.data.health.rollbacks}
                </div>
                <p className="mt-2 font-mono text-[10px] text-faint">{summary.data.health.rollbackRefs}</p>
              </div>
            </div>
          ) : (
            <SkeletonRows rows={2} cols={4} />
          )}
        </SectionCard>

        <SectionCard title="Recent activity">
          <div className="max-h-[340px] overflow-y-auto">
            {activity.data ? <ActivityFeed items={activity.data} /> : <SkeletonRows rows={4} cols={2} />}
          </div>
        </SectionCard>
      </div>

      {/* Recent releases */}
      <SectionCard
        title="Recent releases"
        aside={
          <Link to="/releases" className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
            View all ▸
          </Link>
        }
      >
        {releases.isLoading ? (
          <SkeletonRows rows={4} cols={6} />
        ) : (releases.data ?? []).length === 0 ? (
          <EmptyState icon={Activity} title="No releases have been deployed." compact />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-4 py-2 font-medium">Release</th>
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="w-40 px-3 py-2 font-medium">Rollout</th>
                  <th className="px-4 py-2 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(releases.data ?? []).slice(0, 5).map((release) => (
                  <tr
                    key={release.id}
                    className="row-hover cursor-pointer"
                    onClick={() => void navigate({ to: "/releases/$releaseId", params: { releaseId: release.id } })}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-mono">#{release.number}</span>{" "}
                      <span className="font-mono text-faint">{release.shortId ?? release.id.slice(0, 8)}{release.version ? ` · ${release.version}` : ""}</span>
                    </td>
                    <td className="px-3 py-2.5">{release.appName}</td>
                    <td className="px-3 py-2.5">
                      <PlatformTag platform={release.platform} />
                    </td>
                    <td className="px-3 py-2.5">
                      <EnvBadge environment={release.environment} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={release.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <RolloutBar
                        value={release.rollout}
                        tone={release.status === "paused" ? "warning" : release.status === "rolled_back" ? "neutral" : "brand"}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
                      {release.createdAt.slice(5, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Active rollouts + progressive onboarding */}
      <div className="grid gap-3 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Active rollouts">
          {rollouts.isLoading ? (
            <SkeletonRows rows={3} cols={4} />
          ) : (rollouts.data ?? []).length === 0 ? (
            <EmptyState icon={Play} title="No active rollouts." compact />
          ) : (
            <ul className="divide-y divide-border">
              {(rollouts.data ?? []).map((rollout) => (
                <li key={rollout.id} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/rollouts/$rolloutId"
                      params={{ rolloutId: rollout.id }}
                      className="text-[12px] font-medium hover:text-brand"
                    >
                      {rollout.appName} · {rollout.releaseLabel}
                    </Link>
                    <EnvBadge environment={rollout.environment} />
                    <PlatformTag platform={rollout.platform} />
                    <span className="ml-auto font-mono text-[10px] text-faint">
                      {rollout.status === "paused" ? "paused" : "updated"} · {rollout.startedAt}
                    </span>
                  </div>
                  <RolloutBar
                    value={rollout.current}
                    tone={rollout.status === "paused" ? "warning" : "brand"}
                    className="mt-2.5"
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Get to your first OTA update">
          <ol className="space-y-3 p-4">
            {[
              ["Firebase project connected", firebaseConnected, "/projects/connect"],
              ["React Native application registered", hasApps, "/apps/new"],
              ["First OTA release published", hasPublished, firstAppId ? `/apps/${firstAppId}/releases/new` : "/apps/new"],
              ["CI/CD pipeline connected", hasApiKey, "/settings/ci-cd"],
            ].map(([label, done, to]) => (
              <li key={String(label)} className="flex items-start gap-2.5">
                <span aria-hidden className={`font-mono text-[12px] ${done ? "text-success" : "text-faint"}`}>
                  {done ? "✓" : "○"}
                </span>
                <div>
                  <p className="text-[12px]">{label}</p>
                  {!done ? (
                    <Link to={to as never} className="font-mono text-[10px] text-brand hover:underline">
                      Continue →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-border px-4 py-3">
            <Label>Free at the platform level</Label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              You pay Firebase for storage and bandwidth. FireOTA never charges for releases.
            </p>
            <Button variant="outline" size="sm" className="mt-3 h-7 gap-1.5 text-[11px]" asChild>
              <Link to="/projects">
                <Database aria-hidden className="size-3" /> Firebase projects
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
