import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  EmptyState,
  EnvBadge,
  PageHeader,
  PlatformTag,
  RolloutBar,
  SectionCard,
  SkeletonRows,
  StatusBadge,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import { channelsService } from "@/services";

export const Route = createFileRoute("/channels")({
  head: () => ({
    meta: [
      { title: "Channels — FireOTA" },
      {
        name: "description",
        content: "Production, beta and staging channels with their current release, rollout state and promotion history.",
      },
      { property: "og:title", content: "Channels — FireOTA" },
      { property: "og:description", content: "Manage OTA channels and promote releases between environments." },
    ],
  }),
  component: ChannelsPage,
});

function ChannelsPage() {
  const client = useQueryClient();
  const [appId, setAppId] = useState("all");
  const apps = useQuery(q.apps());
  const channels = useQuery(q.channels(appId === "all" ? undefined : appId));

  const promote = useMutation({
    mutationFn: ({ channelId, releaseId }: { channelId: string; releaseId: string }) =>
      channelsService.promote(channelId, releaseId),
    onSuccess: () => {
      toast.success("Release promoted. Rollout starts at 0%.");
      void client.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Channels" }]}>
      <PageHeader
        title="Channels"
        description="Channels decide which devices receive which release."
        actions={
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
        }
      />

      {channels.isLoading ? (
        <SectionCard>
          <SkeletonRows rows={4} cols={4} />
        </SectionCard>
      ) : (channels.data ?? []).length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={GitBranch}
            title="No channels configured."
            description="Channels are created when you register an application."
            actions={
              <Button size="sm" asChild>
                <Link to="/apps/new">Add Application</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {(channels.data ?? []).map((channel) => (
            <SectionCard
              key={channel.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="font-mono">{channel.name}</span>
                  <EnvBadge environment={channel.environment} />
                  <span className="text-[11px] font-normal text-muted-foreground">{channel.appName}</span>
                </span>
              }
              aside={<PlatformTag platform={channel.platform} />}
            >
              <div className="space-y-3 p-4">
                <p className="text-[12px] text-muted-foreground">{channel.description}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[12px]">{channel.currentRelease}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      channel.status === "active" ? "text-success" : channel.status === "paused" ? "text-warning" : "text-faint"
                    }`}
                  >
                    {channel.status.toUpperCase()}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-faint">updated {channel.updatedAt}</span>
                </div>
                <RolloutBar value={channel.rollout} tone={channel.status === "paused" ? "warning" : "brand"} />
                <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-[11px]">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Update policy</dt>
                    <dd>{channel.updatePolicy}</dd>
                  </div>
                </dl>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Promotion history</p>
                  <ul className="mt-1.5 space-y-1">
                    {channel.history.map((entry) => (
                      <li key={`${entry.release}-${entry.at}`} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono">{entry.release}</span>
                        <span className="font-mono text-faint">v{entry.version}</span>
                        <StatusBadge status={entry.status} />
                        <span className="ml-auto font-mono text-[10px] text-faint">{entry.at}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <ConfirmAction
                    trigger={
                      <Button variant="outline" size="sm" className="h-7 text-[11px]">
                        Promote latest release
                      </Button>
                    }
                    title={`Promote into ${channel.name}`}
                    description="The most recent release from the previous environment is copied into this channel at 0% rollout."
                    warning={
                      channel.environment === "production"
                        ? "This targets your production channel. Devices update only after you raise the rollout."
                        : undefined
                    }
                    confirmLabel="Promote release"
                    destructive={channel.environment === "production"}
                    {...(channel.environment === "production" ? { requireTyped: "PROMOTE" } : {})}
                    details={[
                      { label: "Channel", value: channel.name },
                      { label: "Application", value: channel.appName },
                      { label: "Current release", value: channel.currentRelease },
                    ]}
                    onConfirm={async () => {
                      await promote.mutateAsync({ channelId: channel.id, releaseId: "latest" });
                    }}
                  />
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" asChild>
                    <Link to="/releases">View releases</Link>
                  </Button>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
