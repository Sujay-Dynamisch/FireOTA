import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader, RolloutBar, SectionCard, SkeletonBlock, StatCard } from "@/components/fireota/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — FireOTA" },
      {
        name: "description",
        content: "Update checks, downloads, install success, adoption curves and version distribution for OTA releases.",
      },
      { property: "og:title", content: "Analytics — FireOTA" },
      { property: "og:description", content: "Adoption curves and install health for every OTA release." },
    ],
  }),
  component: AnalyticsPage,
});

const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 11,
} as const;

function AnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [appId, setAppId] = useState("all");
  const apps = useQuery(q.apps());
  const analytics = useQuery(q.analytics({ range, appId }));
  const data = analytics.data;
  const successRate = data
    ? Number(((data.successfulInstalls / Math.max(data.successfulInstalls + data.failedInstalls, 1)) * 100).toFixed(1))
    : 0;
  const totalDevices = data ? data.platformDistribution.reduce((sum, p) => sum + p.devices, 0) : 0;

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Analytics" }]}>
      <PageHeader
        title="Analytics"
        description="How your OTA updates actually land on devices."
        actions={
          <>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger className="h-8 w-[170px] text-[12px]" aria-label="Filter by application">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All applications</SelectItem>
                {(apps.data ?? []).map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-8 w-[130px] text-[12px]" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {!data ? (
          <>
            <SkeletonBlock className="h-[92px]" />
            <SkeletonBlock className="h-[92px]" />
            <SkeletonBlock className="h-[92px]" />
            <SkeletonBlock className="h-[92px]" />
          </>
        ) : (
          <>
            <StatCard
              label="Update checks"
              value={data.updateChecks.toLocaleString()}
              hint={`${data.updatesAvailable.toLocaleString()} served an update`}
            />
            <StatCard label="Downloads" value={data.downloads.toLocaleString()} hint={`${data.adoption}% adoption`} />
            <StatCard
              label="Successful installs"
              value={data.successfulInstalls.toLocaleString()}
              hint={`${successRate}% success rate`}
              accent
              progress={successRate}
            />
            <StatCard
              label="Failed installs"
              value={data.failedInstalls.toLocaleString()}
              hint={`${data.rollbacks} rollbacks`}
            />
          </>
        )}
      </div>

      <SectionCard
        title="Adoption and failures over time"
        aside={<span className="font-mono text-[10px] text-faint">% of eligible devices · failure count</span>}
      >
        <div className="h-[280px] p-4">
          {!data ? (
            <SkeletonBlock className="h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.adoptionSeries}>
                <defs>
                  <linearGradient id="adoption" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--faint)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--faint)" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  name="Adoption"
                  dataKey="adoption"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fill="url(#adoption)"
                />
                <Line type="monotone" name="Failures" dataKey="failures" stroke="var(--danger)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Version distribution" aside={<span className="font-mono text-[10px] text-faint">devices per release</span>}>
          {!data ? (
            <SkeletonBlock className="m-4 h-40" />
          ) : (
            <ul className="divide-y divide-border">
              {data.versionDistribution.map((row) => (
                <li key={row.version} className="p-3.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-mono">{row.version === "store" ? "Store build (no OTA yet)" : `v${row.version}`}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{row.devices.toLocaleString()}</span>
                  </div>
                  <RolloutBar
                    value={Math.round(
                      (row.devices / Math.max(...data.versionDistribution.map((v) => v.devices), 1)) * 100,
                    )}
                    showValue={false}
                    className="mt-2"
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Platform distribution" aside={<span className="font-mono text-[10px] text-faint">active devices</span>}>
          {!data ? (
            <SkeletonBlock className="m-4 h-40" />
          ) : (
            <ul className="divide-y divide-border">
              {data.platformDistribution.map((row) => (
                <li key={row.platform} className="p-3.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span>{row.platform === "android" ? "Android" : row.platform === "ios" ? "iOS" : row.platform}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{row.devices.toLocaleString()}</span>
                  </div>
                  <RolloutBar
                    value={Math.round((row.devices / Math.max(totalDevices, 1)) * 100)}
                    tone="neutral"
                    className="mt-2"
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
