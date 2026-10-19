import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import {
  CodeBlock,
  EmptyState,
  EnvBadge,
  ErrorState,
  MetaGrid,
  PageHeader,
  PlatformTag,
  RolloutBar,
  SectionCard,
  SkeletonBlock,
  SkeletonRows,
  StatCard,
  StatusBadge,
} from "@/components/fireota/primitives";
import { CodeSigningPanel, DeleteAppPanel, RuntimesPanel } from "@/components/fireota/app-admin";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/apps/$appId/")({
  head: () => ({
    meta: [
      { title: "Application — FireOTA" },
      {
        name: "description",
        content: "Channels, releases, device adoption and SDK configuration for a single React Native application.",
      },
      { property: "og:title", content: "Application — FireOTA" },
      { property: "og:description", content: "Channels, releases and device adoption for a React Native app." },
    ],
  }),
  component: AppDetailPage,
});

function AppDetailPage() {
  const { appId } = useParams({ from: "/apps/$appId/" });
  const navigate = useNavigate();
  const { can } = usePermissions();
  const app = useQuery(q.app(appId));
  const releases = useQuery(q.releases({ appId }));
  const channels = useQuery(q.channels(appId));

  if (app.isLoading) {
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Applications", to: "/apps" },
          { label: "Loading" },
        ]}
      >
        <SkeletonBlock className="h-16" />
        <SkeletonRows rows={5} cols={4} />
      </AppShell>
    );
  }

  if (app.error || !app.data) {
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Applications", to: "/apps" },
          { label: "Not found" },
        ]}
      >
        <ErrorState
          title="This application could not be loaded."
          description="It may have been removed, or your role may not include access to it."
          action={
            <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/apps" })}>
              Back to applications
            </Button>
          }
        />
      </AppShell>
    );
  }

  const data = app.data;
  const devices = data.devices.android + data.devices.ios;

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Applications", to: "/apps" },
        { label: data.name },
      ]}
    >
      <PageHeader
        title={data.name}
        description={`Runtime ${data.runtimeVersion} · current release ${data.currentRelease}`}
        meta={
          <>
            <PlatformTag platform={data.platforms.length > 1 ? "all" : data.platforms[0]!} />
            <span className="font-mono text-[11px] text-faint">{data.slug}</span>
            <span
              className={`font-mono text-[10px] ${data.status === "active" ? "text-success" : "text-warning"}`}
            >
              {data.status.toUpperCase()}
            </span>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/channels">Channels</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/apps/$appId/releases/new" params={{ appId: data.id }}>
                Create Release
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Active devices" value={devices.toLocaleString()} hint="last 30 days" />
        <StatCard label="Android" value={data.devices.android.toLocaleString()} hint={`${data.updateRate.android}% updated`} />
        <StatCard label="iOS" value={data.devices.ios.toLocaleString()} hint={`${data.updateRate.ios}% updated`} />
        <StatCard label="Channels" value={data.channels.length} hint={data.channels.join(", ")} accent />
      </div>

      <Tabs defaultValue="releases">
        <TabsList>
          <TabsTrigger value="releases">Releases</TabsTrigger>
          <TabsTrigger value="runtimes">Runtimes</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="signing">Code signing</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="sdk">SDK</TabsTrigger>
        </TabsList>

        <TabsContent value="runtimes" className="mt-3">
          <RuntimesPanel app={data} />
        </TabsContent>

        <TabsContent value="signing" className="mt-3">
          <CodeSigningPanel app={data} canEdit={can("app.update")} />
        </TabsContent>

        <TabsContent value="releases" className="mt-3">
          <SectionCard title="Release history">
            {releases.isLoading ? (
              <SkeletonRows rows={4} cols={5} />
            ) : (releases.data ?? []).length === 0 ? (
              <EmptyState
                title="No releases for this application yet."
                description="Upload a JavaScript bundle to publish your first OTA release."
                compact
                actions={
                  <Button size="sm" asChild>
                    <Link to="/apps/$appId/releases/new" params={{ appId: data.id }}>
                      Create Release
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {(releases.data ?? []).map((release) => (
                  <li key={release.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
                    <Link
                      to="/releases/$releaseId"
                      params={{ releaseId: release.id }}
                      className="font-mono text-[12px] hover:text-brand"
                    >
                      #{release.number} · {release.shortId ?? release.id.slice(0, 8)}
                      {release.version ? ` (${release.version})` : ""}
                    </Link>
                    <span className="font-mono text-[10px] text-faint">runtime {release.runtimeVersion}</span>
                    {release.signed ? <span className="font-mono text-[10px] text-success">signed</span> : null}
                    <EnvBadge environment={release.environment} />
                    <PlatformTag platform={release.platform} />
                    <StatusBadge status={release.status} />
                    <div className="w-full max-w-[180px] sm:ml-auto">
                      <RolloutBar value={release.rollout} tone={release.status === "paused" ? "warning" : "brand"} />
                    </div>
                    <span className="font-mono text-[10px] text-faint">{release.createdAt.slice(0, 16)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="channels" className="mt-3">
          <SectionCard title="Channels">
            {channels.isLoading ? (
              <SkeletonRows rows={3} cols={4} />
            ) : (
              <ul className="divide-y divide-border">
                {(channels.data ?? []).map((channel) => (
                  <li key={channel.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5 text-[12px]">
                    <span className="font-mono">{channel.name}</span>
                    <EnvBadge environment={channel.environment} />
                    <span className="text-muted-foreground">{channel.description}</span>
                    <span className="font-mono text-[11px] sm:ml-auto">{channel.currentRelease}</span>
                    <div className="w-full max-w-[160px]">
                      <RolloutBar value={channel.rollout} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="configuration" className="mt-3">
          <SectionCard title="Application configuration">
            <MetaGrid
              items={[
                { label: "Application ID", value: <span className="font-mono">{data.id}</span> },
                { label: "Slug", value: <span className="font-mono">{data.slug}</span> },
                { label: "Android package", value: <span className="font-mono">{data.androidPackage || "—"}</span> },
                { label: "iOS bundle ID", value: <span className="font-mono">{data.iosBundleId || "—"}</span> },
                { label: "Runtime version", value: <span className="font-mono">{data.runtimeVersion}</span> },
                { label: "Firebase project", value: <span className="font-mono">{data.firebaseProjectId}</span> },
                { label: "Default channel", value: <span className="font-mono">{data.channels[0] ?? "—"}</span> },
                { label: "Status", value: data.status },
              ]}
            />
          </SectionCard>
          {can("app.delete") ? (
            <div className="mt-3">
              <DeleteAppPanel app={data} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="sdk" className="mt-3">
          <SectionCard title="Install the FireOTA SDK">
            <div className="space-y-4 p-4">
              <p className="text-[12px] text-muted-foreground">
                Two commands set everything up — config file, update prompt, Android and iOS wiring:
              </p>
              <CodeBlock
                code={`npm install @fireota/react-native && npm install --save-dev @fireota/cli
npx fireota init --app ${data.id} --server-url ${typeof window !== "undefined" ? window.location.origin : "https://your-fireota-domain"}`}
              />
              <p className="text-[11px] text-muted-foreground">Or configure it by hand:</p>
              <CodeBlock
                language="tsx"
                code={`import { FireOTA } from "@fireota/react-native";\n\nFireOTA.configure({\n  appId: "${data.id}",\n  serverUrl: "${typeof window !== "undefined" ? window.location.origin : "https://your-fireota-domain"}",\n  channel: "${data.channels[0] ?? "production"}",\n  runtimeVersion: "${data.runtimeVersion}", // must match the store build\n  checkOnAppStart: true,${data.codeSigning?.keyId ? "\n  codeSigningCertificate: PUBLIC_KEY_PEM, // required: this app verifies signatures" : ""}\n});`}
              />
              <p className="text-[11px] text-muted-foreground">
                Bundles are downloaded straight from your own Firebase Storage bucket — FireOTA never proxies your
                traffic.
              </p>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
