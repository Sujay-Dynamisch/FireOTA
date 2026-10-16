import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { GitBranch, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  EmptyState,
  EnvBadge,
  PageHeader,
  RolloutBar,
  SectionCard,
  SkeletonRows,
  StatusBadge,
} from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import type { ChannelRecord, Environment } from "@/lib/types";
import { channelsService } from "@/services";

export const Route = createFileRoute("/channels")({
  head: () => ({
    meta: [
      { title: "Channels — FireOTA" },
      {
        name: "description",
        content:
          "Create, edit, pause and delete OTA channels; see what each serves and promote updates between them.",
      },
      { property: "og:title", content: "Channels — FireOTA" },
      {
        property: "og:description",
        content: "Manage OTA channels and promote releases between environments.",
      },
    ],
  }),
  component: ChannelsPage,
});

const ENVIRONMENTS: Environment[] = ["production", "beta", "staging", "development"];

interface ChannelForm {
  appId: string;
  name: string;
  environment: Environment;
  description: string;
  updatePolicy: "immediate" | "staged";
}

function ChannelDialog({
  open,
  onOpenChange,
  channel,
  apps,
  defaultAppId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChannelRecord | null;
  apps: { id: string; name: string }[];
  defaultAppId: string;
}) {
  const client = useQueryClient();
  const [form, setForm] = useState<ChannelForm>(() => ({
    appId: channel?.appId ?? defaultAppId,
    name: channel?.name ?? "",
    environment: channel?.environment ?? "beta",
    description: channel?.description ?? "",
    updatePolicy: channel?.updatePolicy === "staged" ? "staged" : "immediate",
  }));
  const save = useMutation({
    mutationFn: () =>
      channel
        ? channelsService.update(channel.id, {
            name: form.name,
            environment: form.environment,
            description: form.description,
            updatePolicy: form.updatePolicy,
          })
        : channelsService.create(form),
    onSuccess: () => {
      toast.success(channel ? "Channel updated." : "Channel created.");
      void client.invalidateQueries({ queryKey: ["channels"] });
      void client.invalidateQueries({ queryKey: ["apps"] });
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the channel."),
  });
  const set = <K extends keyof ChannelForm>(key: K, value: ChannelForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{channel ? `Edit ${channel.name}` : "Create a channel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!channel ? (
            <Field label="Application">
              <Select value={form.appId} onValueChange={(v) => set("appId", v)}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue placeholder="Choose an application" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field
            label="Channel name"
            htmlFor="channel-name"
            hint="Lowercase letters, digits and dashes — the SDK's `channel` option."
          >
            <Input
              id="channel-name"
              value={form.name}
              onChange={(e) =>
                set("name", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
              placeholder="internal-qa"
              className="h-9 font-mono text-[12px]"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Environment">
              <Select
                value={form.environment}
                onValueChange={(v) => set("environment", v as Environment)}
              >
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Update policy">
              <Select
                value={form.updatePolicy}
                onValueChange={(v) => set("updatePolicy", v as "immediate" | "staged")}
              >
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate (100%)</SelectItem>
                  <SelectItem value="staged">Staged rollout</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="channel-description">
            <Input
              id="channel-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Internal QA devices"
              className="h-9 text-[12px]"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={form.name.length < 2 || !form.appId || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : channel ? "Save changes" : "Create channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromoteDialog({ channel, onClose }: { channel: ChannelRecord; onClose: () => void }) {
  const client = useQueryClient();
  const releases = useQuery(q.releases({ appId: channel.appId }));
  const [releaseId, setReleaseId] = useState("");
  const [rollout, setRollout] = useState(channel.environment === "production" ? 10 : 100);
  const candidates = (releases.data ?? []).filter(
    (r) =>
      r.channelId !== channel.id &&
      r.checksum &&
      ["ready", "published", "paused"].includes(r.status),
  );
  const promote = useMutation({
    mutationFn: () => channelsService.promote(channel.name, releaseId, rollout),
    onSuccess: () => {
      toast.success(`Promoted into ${channel.name} at ${rollout}%.`);
      void client.invalidateQueries({ queryKey: ["channels"] });
      void client.invalidateQueries({ queryKey: ["releases"] });
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not promote the update."),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote an update into {channel.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Update" hint="Verified updates of this app from other channels.">
            <Select value={releaseId} onValueChange={setReleaseId}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue
                  placeholder={candidates.length ? "Choose an update" : "No update to promote yet"}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    #{r.number} · {r.shortId ?? r.id.slice(0, 8)} · {r.channelName} · {r.platform} ·
                    runtime {r.runtimeVersion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Start rollout at ${rollout}%`}>
            <Slider
              value={[rollout]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setRollout(v[0] ?? 0)}
            />
          </Field>
          {channel.environment === "production" ? (
            <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
              This is a production channel. Start small and raise the rollout as health stays green.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!releaseId || promote.isPending}
            onClick={() => promote.mutate()}
          >
            {promote.isPending ? "Promoting…" : "Promote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelsPage() {
  const client = useQueryClient();
  const { can } = usePermissions();
  const [appId, setAppId] = useState("all");
  const apps = useQuery(q.apps());
  const channels = useQuery(q.channels(appId === "all" ? undefined : appId));
  const [editing, setEditing] = useState<ChannelRecord | "new" | null>(null);
  const [promoting, setPromoting] = useState<ChannelRecord | null>(null);

  const refresh = () => void client.invalidateQueries({ queryKey: ["channels"] });
  const onError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Something went wrong.");
  const togglePause = useMutation({
    mutationFn: (channel: ChannelRecord) =>
      channelsService.update(channel.id, {
        status: channel.status === "paused" ? "active" : "paused",
      }),
    onSuccess: (_d, channel) => {
      toast.success(
        channel.status === "paused"
          ? `${channel.name} resumed.`
          : `${channel.name} paused — devices get no updates from it.`,
      );
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => channelsService.remove(id),
    onSuccess: () => {
      toast.success("Channel deleted.");
      refresh();
    },
    onError,
  });

  const appList = (apps.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  const grouped = new Map<string, ChannelRecord[]>();
  for (const channel of channels.data ?? [])
    grouped.set(channel.appName, [...(grouped.get(channel.appName) ?? []), channel]);

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Channels" }]}>
      <PageHeader
        title="Channels"
        description="A channel decides which devices receive which update. The SDK's `channel` option picks one."
        actions={
          <div className="flex gap-2">
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger
                className="h-8 w-[170px] text-[12px]"
                aria-label="Filter by application"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All applications</SelectItem>
                {appList.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {can("channel.create") && appList.length > 0 ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> New channel
              </Button>
            ) : null}
          </div>
        }
      />

      {editing ? (
        <ChannelDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          channel={editing === "new" ? null : editing}
          apps={appList}
          defaultAppId={appId !== "all" ? appId : (appList[0]?.id ?? "")}
        />
      ) : null}
      {promoting ? <PromoteDialog channel={promoting} onClose={() => setPromoting(null)} /> : null}

      {channels.isLoading ? (
        <SectionCard>
          <SkeletonRows rows={4} cols={5} />
        </SectionCard>
      ) : (channels.data ?? []).length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={GitBranch}
            title="No channels configured."
            description="Four channels are created when you register an application. You can add your own."
            actions={
              <Button size="sm" asChild>
                <Link to="/apps/new">Add Application</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([appName, list]) => (
            <SectionCard
              key={appName}
              title={appName}
              aside={
                <span className="font-mono text-[10px] text-faint">{list.length} channels</span>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                      <th className="px-4 py-2 font-medium">Channel</th>
                      <th className="px-3 py-2 font-medium">Serving</th>
                      <th className="px-3 py-2 font-medium">Rollout</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Recent</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((channel) => (
                      <tr key={channel.id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{channel.name}</span>
                            <EnvBadge environment={channel.environment} />
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {channel.description || "—"}
                          </p>
                          <p className="font-mono text-[10px] text-faint">
                            policy: {channel.updatePolicy}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {channel.activeReleaseId ? (
                            <Link
                              to="/releases/$releaseId"
                              params={{ releaseId: channel.activeReleaseId }}
                              className="font-mono hover:text-brand"
                            >
                              {channel.currentRelease}
                            </Link>
                          ) : (
                            <span className="font-mono text-faint">nothing yet</span>
                          )}
                        </td>
                        <td className="w-40 px-3 py-3">
                          <RolloutBar
                            value={channel.rollout}
                            tone={channel.status === "paused" ? "warning" : "brand"}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`font-mono text-[10px] ${
                              channel.status === "active"
                                ? "text-success"
                                : channel.status === "paused"
                                  ? "text-warning"
                                  : "text-faint"
                            }`}
                          >
                            {channel.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <ul className="space-y-0.5">
                            {channel.history.slice(0, 3).map((entry) => (
                              <li
                                key={`${entry.release}-${entry.at}`}
                                className="flex items-center gap-1.5 text-[10px]"
                              >
                                <span className="font-mono">{entry.release}</span>
                                <StatusBadge status={entry.status} />
                              </li>
                            ))}
                            {channel.history.length === 0 ? (
                              <li className="font-mono text-[10px] text-faint">—</li>
                            ) : null}
                          </ul>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            {can("release.publish") ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px]"
                                onClick={() => setPromoting(channel)}
                              >
                                Promote
                              </Button>
                            ) : null}
                            {can("channel.update") ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  aria-label={
                                    channel.status === "paused"
                                      ? `Resume ${channel.name}`
                                      : `Pause ${channel.name}`
                                  }
                                  title={
                                    channel.status === "paused" ? "Resume channel" : "Pause channel"
                                  }
                                  disabled={togglePause.isPending}
                                  onClick={() => togglePause.mutate(channel)}
                                >
                                  {channel.status === "paused" ? (
                                    <Play className="size-3.5" />
                                  ) : (
                                    <Pause className="size-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  aria-label={`Edit ${channel.name}`}
                                  title="Edit channel"
                                  onClick={() => setEditing(channel)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              </>
                            ) : null}
                            {can("channel.delete") ? (
                              <ConfirmAction
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-danger"
                                    aria-label={`Delete ${channel.name}`}
                                    title="Delete channel"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                }
                                title={`Delete ${channel.name}`}
                                description="Devices configured for this channel stop receiving updates. Its update history stays in Releases."
                                warning={
                                  channel.activeReleaseId
                                    ? "This channel is serving an update; roll it back or archive it first."
                                    : undefined
                                }
                                confirmLabel="Delete channel"
                                destructive
                                requireTyped={channel.name}
                                details={[
                                  { label: "Application", value: channel.appName },
                                  { label: "Channel", value: channel.name },
                                ]}
                                onConfirm={async () => {
                                  await remove.mutateAsync(channel.id);
                                }}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
