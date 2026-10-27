import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  CodeBlock,
  CopyButton,
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
  Timeline,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { q } from "@/lib/queries";
import { channelsService, releasesService } from "@/services";

export const Route = createFileRoute("/releases/$releaseId")({
  head: () => ({
    meta: [
      { title: "Release detail — FireOTA" },
      {
        name: "description",
        content: "Bundle artifacts, rollout controls, device metrics and timeline for a single OTA release.",
      },
      { property: "og:title", content: "Release detail — FireOTA" },
      { property: "og:description", content: "Inspect artifacts, rollout progress and metrics for an OTA release." },
    ],
  }),
  errorComponent: ({ error }) => {
    console.error("RELEASE ERROR DETAIL:", error);
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Releases", to: "/releases" },
          { label: "Error" },
        ]}
      >
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-sm border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono text-[10px] text-danger">
            <span aria-hidden>✕</span> ERROR
          </span>
          <p className="font-display text-[15px] font-bold tracking-tight">This release could not be loaded.</p>
          <p className="mt-1 max-w-lg text-[12px] text-muted-foreground whitespace-pre-wrap">
            {friendlyError(error, "Something went wrong while loading this release.")}
          </p>
          {error instanceof Error && error.stack ? (
            <pre className="mt-3 max-h-48 max-w-xl overflow-auto rounded border border-border bg-surface-2 p-3 text-left font-mono text-[10px] text-danger/80 whitespace-pre-wrap">
              {error.stack}
            </pre>
          ) : null}
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={() => (window.location.href = "/releases")}>
              Back to releases
            </Button>
          </div>
        </div>
      </AppShell>
    );
  },
  component: ReleaseDetailPage,
});

function ReleaseDetailPage() {
  const { releaseId } = useParams({ from: "/releases/$releaseId" });
  const navigate = useNavigate();
  const client = useQueryClient();
  const release = useQuery(q.release(releaseId));
  const [target, setTarget] = useState<number | null>(null);

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["releases"] });
    void client.invalidateQueries({ queryKey: ["rollouts"] });
  };

  const promote = useMutation({
    mutationFn: () => channelsService.promote("production", releaseId),
    onSuccess: () => {
      toast.success("Release promoted to production at 0% rollout.");
      invalidate();
    },
  });
  const onError = (error: unknown) => toast.error(friendlyError(error, "Something went wrong."));
  const pause = useMutation({
    mutationFn: async (resume: boolean) => {
      if (resume) await releasesService.resume(releaseId);
      else await releasesService.pause(releaseId);
    },
    onSuccess: (_d, resume) => {
      toast.success(resume ? "Rollout resumed." : "Rollout paused. No new devices will receive this release.");
      invalidate();
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: () => releasesService.archive(releaseId),
    onSuccess: () => {
      toast.success("Update archived. It is no longer served.");
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => releasesService.remove(releaseId),
    onSuccess: () => {
      toast.success("Update deleted and its bundle removed from Firebase Storage.");
      invalidate();
      void navigate({ to: "/releases" });
    },
    onError,
  });
  const rollback = useMutation({
    mutationFn: (reason: string) => releasesService.rollback(releaseId, reason),
    onSuccess: () => {
      toast.success("Rolled back. Devices revert on their next update check.");
      invalidate();
    },
  });
  const setRollout = useMutation({
    mutationFn: (value: number) => releasesService.setRollout(releaseId, value),
    onSuccess: (_data, value) => {
      toast.success(`Rollout set to ${value}%.`);
      invalidate();
    },
  });

  if (release.isLoading) {
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Releases", to: "/releases" },
          { label: "Loading" },
        ]}
      >
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-24" />
        <SkeletonRows rows={5} cols={4} />
      </AppShell>
    );
  }

  if (release.error || !release.data) {
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Releases", to: "/releases" },
          { label: "Not found" },
        ]}
      >
        <ErrorState
          title="This release could not be loaded."
          description="It may have been deleted, or you may not have access to its application."
          action={
            <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/releases" })}>
              Back to releases
            </Button>
          }
        />
      </AppShell>
    );
  }

  const data = release.data;
  const isProduction = data.environment === "production";
  const rolloutValue = target ?? data.rollout ?? 0;

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Releases", to: "/releases" },
        { label: `#${data.number}` },
      ]}
    >
      <PageHeader
        title={`Update #${data.number}${data.version ? ` · ${data.version}` : ""}`}
        description={data.notes}
        meta={
          <>
            <StatusBadge status={data.status} />
            <EnvBadge environment={data.environment} />
            <PlatformTag platform={data.platform} />
            <span className="font-mono text-[11px] text-faint" title={data.id}>
              id {data.shortId ?? data.id.slice(0, 8)} · {data.appName} · runtime {data.runtimeVersion} · {data.compressedSize}
            </span>
            {data.signed ? (
              <span className="rounded-sm border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success">
                signed · key {data.signatureKeyId ?? "—"}
              </span>
            ) : (
              <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-faint">unsigned</span>
            )}
          </>
        }
        actions={
          <>
            {data.status === "published" || data.status === "paused" ? (
              <Button variant="outline" size="sm" loading={pause.isPending} onClick={() => pause.mutate(data.status === "paused")}>
                {data.status === "paused" ? "Resume rollout" : "Pause rollout"}
              </Button>
            ) : null}
            {["ready", "published", "paused", "rolled_back"].includes(data.status) ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline" size="sm">
                    Archive
                  </Button>
                }
                title="Archive this update"
                description="It stops being served and leaves its channel. Archived updates can then be deleted."
                confirmLabel="Archive update"
                details={[
                  { label: "Update", value: `#${data.number}` },
                  { label: "Channel", value: data.channelName },
                ]}
                onConfirm={async () => {
                  await archive.mutateAsync();
                }}
              />
            ) : null}
            {["draft", "failed", "ready", "archived", "uploading"].includes(data.status) ? (
              <ConfirmAction
                trigger={
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                }
                title="Delete this update"
                description="The update is deleted and its bundle is removed from your Firebase Storage bucket."
                warning="This cannot be undone."
                confirmLabel="Delete update"
                destructive
                requireTyped="DELETE"
                details={[
                  { label: "Update", value: `#${data.number} · ${data.shortId ?? data.id.slice(0, 8)}` },
                  { label: "Status", value: data.status },
                ]}
                onConfirm={async () => {
                  await remove.mutateAsync();
                }}
              />
            ) : null}
            {data.status !== "draft" && data.status !== "failed" ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline" size="sm">
                    Promote
                  </Button>
                }
                title="Promote to production"
                description="Promoting copies this bundle into the production channel and starts it at 0% rollout."
                warning="Production devices only receive the release once you raise the rollout percentage."
                confirmLabel="Promote release"
                details={[
                  { label: "Release", value: `#${data.number} v${data.version}` },
                  { label: "From", value: data.channelName },
                  { label: "To", value: "production" },
                  { label: "Devices in production", value: (data.metrics?.eligibleDevices ?? 0).toLocaleString() },
                ]}
                onConfirm={async () => {
                  await promote.mutateAsync();
                }}
              />
            ) : null}
            {data.status === "published" || data.status === "paused" ? (
              <ConfirmAction
                trigger={
                  <Button variant="destructive" size="sm">
                    Roll back
                  </Button>
                }
                title="Roll back this release"
                description="Devices on this release revert to the previous bundle on their next update check."
                warning={`${(data.metrics?.updated ?? 0).toLocaleString()} devices are currently running this release.`}
                confirmLabel="Roll back release"
                destructive
                {...(isProduction ? { requireTyped: "ROLLBACK" } : {})}
                requireReason
                details={[
                  { label: "Release", value: `#${data.number} v${data.version}` },
                  { label: "Channel", value: data.channelName },
                  { label: "Affected devices", value: (data.metrics?.updated ?? 0).toLocaleString() },
                ]}
                onConfirm={async ({ reason }) => {
                  await rollback.mutateAsync(reason ?? "");
                }}
              />
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Eligible devices"
          value={(data.metrics?.eligibleDevices ?? 0).toLocaleString()}
          hint={`${(data.metrics?.totalDevices ?? 0).toLocaleString()} total`}
        />
        <StatCard
          label="Updated"
          value={(data.metrics?.updated ?? 0).toLocaleString()}
          hint={`${data.metrics?.adoption ?? 0}% adoption`}
          accent
          progress={data.metrics?.adoption ?? 0}
        />
        <StatCard
          label="Failed installs"
          value={data.metrics?.failed ?? 0}
          hint={`${data.metrics?.successRate ?? 0}% success rate`}
        />
        <StatCard label="Rollout" value={`${data.rollout ?? 0}%`} hint={data.status === "paused" ? "paused" : "active"} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rollout">Rollout</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="install">Install</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <SectionCard title="Release metadata">
            <MetaGrid
              items={[
                { label: "Application", value: data.appName || "—" },
                { label: "Channel", value: <span className="font-mono">{data.channelName || "—"}</span> },
                { label: "Runtime version", value: <span className="font-mono">{data.runtimeVersion}</span> },
                { label: "Native compatibility", value: <span className="font-mono">{data.nativeCompatibility}</span> },
                { label: "Bundle size", value: <span className="font-mono">{data.bundleSize}</span> },
                { label: "Compressed", value: <span className="font-mono">{data.compressedSize}</span> },
                { label: "Mandatory", value: data.mandatory ? "Yes — blocking update" : "No" },
                { label: "Build number", value: <span className="font-mono">{data.buildNumber || "—"}</span> },
                { label: "Git branch", value: <span className="font-mono">{data.gitBranch || "—"}</span> },
                { label: "Git commit", value: <span className="font-mono">{data.gitCommit || "—"}</span> },
                { label: "Created by", value: data.createdBy || "—" },
                { label: "Published", value: <span className="font-mono">{data.publishedAt ?? "not published"}</span> },
              ]}
            />
          </SectionCard>
          <SectionCard title="Checksum">
            <div className="flex flex-wrap items-center gap-2 p-4">
              <code className="break-all font-mono text-[11px] text-muted-foreground">
                {data.checksum || "Not generated yet (draft release)"}
              </code>
              {data.checksum ? <CopyButton value={data.checksum} label="Copy checksum" /> : null}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="rollout" className="mt-3 space-y-3">
          <SectionCard title="Staged rollout">
            <div className="space-y-5 p-4">
              <RolloutBar value={data.rollout} tone={data.status === "paused" ? "warning" : "brand"} />
              <div>
                <div className="flex items-center justify-between text-[12px]">
                  <span>Target percentage</span>
                  <span className="font-mono">{rolloutValue}%</span>
                </div>
                <Slider
                  aria-label="Rollout percentage"
                  className="mt-3"
                  value={[rolloutValue]}
                  onValueChange={(value) => setTarget(value[0] ?? 0)}
                  min={0}
                  max={100}
                  step={1}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[1, 5, 10, 25, 50, 100].map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className="h-7 font-mono text-[11px]"
                      onClick={() => setTarget(preset)}
                    >
                      {preset}%
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {isProduction ? (
                  <ConfirmAction
                    trigger={
                      <Button size="sm" disabled={rolloutValue === data.rollout || setRollout.isPending}>
                        Apply rollout
                      </Button>
                    }
                    title="Change production rollout"
                    description="This changes how many production devices receive the release on their next update check."
                    warning="Rollout changes take effect immediately and cannot be undone without a rollback."
                    confirmLabel="Apply rollout"
                    destructive={rolloutValue > data.rollout + 25}
                    details={[
                      { label: "Current", value: `${data.rollout}%` },
                      { label: "New", value: `${rolloutValue}%` },
                      {
                        label: "Devices affected",
                        value: Math.round(((data.metrics?.eligibleDevices ?? 0) * rolloutValue) / 100).toLocaleString(),
                      },
                    ]}
                    onConfirm={async () => {
                      await setRollout.mutateAsync(rolloutValue);
                      setTarget(null);
                    }}
                  />
                ) : (
                  <Button
                    size="sm"
                    disabled={rolloutValue === data.rollout || setRollout.isPending}
                    loading={setRollout.isPending}
                    onClick={() => {
                      setRollout.mutate(rolloutValue);
                      setTarget(null);
                    }}
                  >
                    Apply rollout
                  </Button>
                )}
                <span className="font-mono text-[10px] text-faint">
                  automatic rollback if the failure rate exceeds 5%
                </span>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="artifacts" className="mt-3">
          <SectionCard title="Firebase Storage artifacts">
            {(data.artifacts ?? []).length > 0 ? (
              <ul className="divide-y divide-border">
                {(data.artifacts ?? []).map((artifact, i) => (
                  <li key={`${artifact.kind}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-[12px]">
                    <span className="w-24 font-mono">{artifact.kind}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{artifact.size}</span>
                    <span className="font-mono text-[10px] text-faint">{artifact.path}</span>
                    <span
                      className={`ml-auto font-mono text-[10px] ${
                        artifact.status === "stored"
                          ? "text-success"
                          : artifact.status === "processing"
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {(artifact.status || "MISSING").toUpperCase()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-[12px] text-muted-foreground">No storage artifacts uploaded for this release.</p>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="timeline" className="mt-3">
          <SectionCard title="Release timeline">
            <Timeline steps={data.timeline ?? []} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="install" className="mt-3">
          <SectionCard title="Reproduce with the CLI">
            <div className="space-y-3 p-4">
              <CodeBlock
                code={`fireota release publish \\\n  --app ${data.appId} \\\n  --channel ${data.channelName} \\\n  --runtime ${data.runtimeVersion} \\\n  --rollout ${data.rollout}`}
              />
              <p className="text-[11px] text-muted-foreground">
                The same call is available over the REST API with an API key scoped to this application.
              </p>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
