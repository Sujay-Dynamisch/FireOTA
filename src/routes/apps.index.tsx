import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Boxes, LayoutGrid, List } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { DataTable, type Column } from "@/components/fireota/data-table";
import { EmptyState, PageHeader, PlatformTag, SectionCard, SkeletonBlock } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { q } from "@/lib/queries";
import type { AppRecord } from "@/lib/types";

export const Route = createFileRoute("/apps/")({
  head: () => ({
    meta: [
      { title: "Applications — FireOTA" },
      { name: "description", content: "Manage the React Native applications receiving OTA updates from your Firebase project." },
      { property: "og:title", content: "Applications — FireOTA" },
      { property: "og:description", content: "Platforms, runtimes, channels and current release for every app." },
    ],
  }),
  component: AppsPage,
});

function AppsPage() {
  const navigate = useNavigate();
  const apps = useQuery(q.apps());
  const [view, setView] = useState<"list" | "grid">("list");

  const columns: Column<AppRecord>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.name,
      render: (row) => (
        <span className="font-medium">
          {row.name} <span className="font-mono text-[10px] text-faint">{row.slug}</span>
        </span>
      ),
    },
    { key: "platforms", header: "Platforms", render: (row) => <PlatformTag platform={row.platforms.length > 1 ? "all" : row.platforms[0]!} /> },
    { key: "release", header: "Current release", render: (row) => <span className="font-mono">{row.currentRelease}</span> },
    { key: "runtime", header: "Runtime", render: (row) => <span className="font-mono text-[11px]">{row.runtimeVersion}</span>, optional: true },
    {
      key: "channels",
      header: "Channels",
      render: (row) => <span className="font-mono text-[11px] text-muted-foreground">{row.channels.join(", ")}</span>,
      optional: true,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={`font-mono text-[11px] ${row.status === "active" ? "text-success" : "text-warning"}`}>
          {row.status === "active" ? "✓ ACTIVE" : row.status === "paused" ? "‖ PAUSED" : "○ SETUP"}
        </span>
      ),
    },
    {
      key: "firebase",
      header: "Firebase project",
      render: (row) => <span className="font-mono text-[11px] text-muted-foreground">{row.firebaseProjectId.replace("fb_", "")}</span>,
      optional: true,
    },
  ];

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Applications" }]}>
      <PageHeader
        title="Applications"
        description="Manage your React Native applications."
        actions={
          <>
            <div className="flex rounded-md border border-border">
              <Button
                variant="ghost"
                size="icon"
                aria-label="List view"
                aria-pressed={view === "list"}
                className={`size-8 rounded-r-none ${view === "list" ? "bg-surface-2" : ""}`}
                onClick={() => setView("list")}
              >
                <List aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                className={`size-8 rounded-l-none ${view === "grid" ? "bg-surface-2" : ""}`}
                onClick={() => setView("grid")}
              >
                <LayoutGrid aria-hidden className="size-3.5" />
              </Button>
            </div>
            <Button size="sm" asChild>
              <Link to="/apps/new">Add Application</Link>
            </Button>
          </>
        }
      />

      {view === "list" ? (
        <DataTable
          rows={apps.data ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          isLoading={apps.isLoading}
          error={apps.error as Error | null}
          searchPlaceholder="Search applications…"
          searchValue={(row) => `${row.name} ${row.slug} ${row.androidPackage} ${row.iosBundleId}`}
          onRowClick={(row) => void navigate({ to: "/apps/$appId", params: { appId: row.id } })}
          emptyState={
            <EmptyState
              icon={Boxes}
              title="No React Native apps yet."
              description="Register an application to start publishing OTA releases."
              actions={
                <Button size="sm" asChild>
                  <Link to="/apps/new">Add Application</Link>
                </Button>
              }
            />
          }
          rowActions={(row) => (
            <Button variant="outline" size="sm" className="h-7 text-[11px]" asChild>
              <Link to="/apps/$appId" params={{ appId: row.id }}>
                Open
              </Link>
            </Button>
          )}
        />
      ) : apps.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(apps.data ?? []).map((app) => (
            <SectionCard key={app.id}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to="/apps/$appId" params={{ appId: app.id }} className="font-display text-[15px] font-bold tracking-tight hover:text-brand">
                      {app.name}
                    </Link>
                    <p className="font-mono text-[10px] text-faint">{app.slug}</p>
                  </div>
                  <span className={`font-mono text-[10px] ${app.status === "active" ? "text-success" : "text-warning"}`}>
                    {app.status === "active" ? "✓ ACTIVE" : "○ SETUP"}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[11px]">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Platforms</dt>
                    <dd>
                      <PlatformTag platform={app.platforms.length > 1 ? "all" : app.platforms[0]!} />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Release</dt>
                    <dd className="font-mono">{app.currentRelease}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Runtime</dt>
                    <dd className="font-mono">{app.runtimeVersion}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Channels</dt>
                    <dd className="font-mono">{app.channels.length}</dd>
                  </div>
                </dl>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
