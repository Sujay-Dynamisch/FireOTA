import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { DataTable, type Column } from "@/components/fireota/data-table";
import { EmptyState, EnvBadge, PageHeader, PlatformTag, RolloutBar, StatusBadge } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import type { ReleaseRecord } from "@/lib/types";

export const Route = createFileRoute("/releases/")({
  head: () => ({
    meta: [
      { title: "Releases — FireOTA" },
      { name: "description", content: "Every OTA release across your React Native applications, with channel, rollout and status." },
      { property: "og:title", content: "Releases — FireOTA" },
      { property: "og:description", content: "Search, filter and inspect every OTA release." },
    ],
  }),
  component: ReleasesPage,
});

function ReleasesPage() {
  const navigate = useNavigate();
  const [appId, setAppId] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");

  const apps = useQuery(q.apps());
  const releaseAppId = appId !== "all" ? appId : apps.data?.[0]?.id;
  const releases = useQuery(
    q.releases({
      ...(appId !== "all" ? { appId } : {}),
      ...(platform !== "all" ? { platform } : {}),
      ...(status !== "all" ? { status } : {}),
    }),
  );

  const columns: Column<ReleaseRecord>[] = [
    {
      key: "release",
      header: "Release",
      sortValue: (row) => row.number,
      render: (row) => (
        <span>
          <span className="font-mono">#{row.number}</span> <span className="font-mono text-faint">{row.shortId ?? row.id.slice(0, 8)}{row.version ? ` · ${row.version}` : ""}</span>{row.signed ? <span className="ml-1 font-mono text-[10px] text-success">signed</span> : null}<span className="block truncate text-[11px] text-muted-foreground">{row.notes}</span>
          {row.mandatory ? <span className="ml-1.5 font-mono text-[10px] text-warning">MANDATORY</span> : null}
        </span>
      ),
    },
    { key: "app", header: "App", sortValue: (row) => row.appName, render: (row) => row.appName },
    { key: "platform", header: "Platform", render: (row) => <PlatformTag platform={row.platform} /> },
    {
      key: "channel",
      header: "Channel",
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <EnvBadge environment={row.environment} />
          <span className="font-mono text-[11px] text-faint">{row.channelName}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "rollout",
      header: "Rollout",
      className: "w-40",
      render: (row) => (
        <RolloutBar
          value={row.rollout}
          tone={row.status === "paused" ? "warning" : row.status === "rolled_back" ? "neutral" : "brand"}
        />
      ),
    },
    { key: "size", header: "Size", optional: true, render: (row) => <span className="font-mono text-[11px]">{row.compressedSize}</span> },
    { key: "runtime", header: "Runtime", optional: true, render: (row) => <span className="font-mono text-[11px]">{row.runtimeVersion}</span> },
    { key: "author", header: "Created by", optional: true, render: (row) => <span className="text-[11px]">{row.createdBy}</span> },
    {
      key: "created",
      header: "Created",
      align: "right",
      sortValue: (row) => row.createdAt,
      render: (row) => <span className="font-mono text-[11px] text-muted-foreground">{row.createdAt.slice(0, 16)}</span>,
    },
  ];

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Releases" }]}>
      <PageHeader
        title="Releases"
        description="Every OTA release published from this organization."
        actions={
          <Button size="sm" asChild>
            <Link to={releaseAppId ? "/apps/$appId/releases/new" : "/apps/new"} params={{ appId: releaseAppId ?? "" }}>
              Create Release
            </Link>
          </Button>
        }
      />

      <DataTable
        rows={releases.data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={releases.isLoading}
        error={releases.error as Error | null}
        pageSize={12}
        searchPlaceholder="Search by number, ID, message, label or author…"
        searchValue={(row) => `${row.number} ${row.id} ${row.version} ${row.notes} ${row.runtimeVersion} ${row.appName} ${row.createdBy} ${row.gitCommit}`}
        onRowClick={(row) => void navigate({ to: "/releases/$releaseId", params: { releaseId: row.id } })}
        filters={
          <>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger className="h-8 w-[150px] text-[12px]" aria-label="Filter by application">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All apps</SelectItem>
                {(apps.data ?? []).map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-8 w-[130px] text-[12px]" aria-label="Filter by platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="android">Android</SelectItem>
                <SelectItem value="ios">iOS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[140px] text-[12px]" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="rolling_out">Rolling out</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="rolled_back">Rolled back</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        emptyState={
          <EmptyState
            icon={Rocket}
            title="No releases match these filters."
            description="Adjust the filters, or publish a new OTA release."
            actions={
              <Button size="sm" asChild>
                <Link to={releaseAppId ? "/apps/$appId/releases/new" : "/apps/new"} params={{ appId: releaseAppId ?? "" }}>
                  Create Release
                </Link>
              </Button>
            }
          />
        }
      />
    </AppShell>
  );
}
