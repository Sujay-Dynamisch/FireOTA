import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  EnvBadge,
  ErrorState,
  MetaGrid,
  PageHeader,
  PlatformTag,
  RolloutBar,
  SectionCard,
  SkeletonBlock,
  StatCard,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { q } from "@/lib/queries";
import { rolloutsService } from "@/services";

export const Route = createFileRoute("/rollouts/$rolloutId")({
  head: () => ({
    meta: [
      { title: "Rollout detail — FireOTA" },
      {
        name: "description",
        content: "Adjust rollout percentage, pause distribution and watch failure thresholds for a staged OTA rollout.",
      },
      { property: "og:title", content: "Rollout detail — FireOTA" },
      { property: "og:description", content: "Control a staged OTA rollout and its safety thresholds." },
    ],
  }),
  component: RolloutDetailPage,
});

function RolloutDetailPage() {
  const { rolloutId } = useParams({ from: "/rollouts/$rolloutId" });
  const navigate = useNavigate();
  const client = useQueryClient();
  const rollout = useQuery(q.rollout(rolloutId));
  const [target, setTarget] = useState<number | null>(null);

  const invalidate = () => void client.invalidateQueries({ queryKey: ["rollouts"] });

  const setPercentage = useMutation({
    mutationFn: (value: number) => rolloutsService.setPercentage(rolloutId, value),
    onSuccess: (_data, value) => {
      toast.success(`Rollout set to ${value}%.`);
      invalidate();
    },
  });
  const pause = useMutation({
    mutationFn: () => rolloutsService.pause(rolloutId),
    onSuccess: () => {
      toast.success("Rollout paused.");
      invalidate();
    },
  });
  const resume = useMutation({
    mutationFn: () => rolloutsService.resume(rolloutId),
    onSuccess: () => {
      toast.success("Rollout resumed.");
      invalidate();
    },
  });

  if (rollout.isLoading) {
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Rollouts", to: "/rollouts" },
          { label: "Loading" },
        ]}
      >
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-40" />
      </AppShell>
    );
  }

  if (rollout.error || !rollout.data) {
    return (
      <AppShell
        breadcrumb={[
          { label: "Helio Labs", to: "/dashboard" },
          { label: "Rollouts", to: "/rollouts" },
          { label: "Not found" },
        ]}
      >
        <ErrorState
          title="This rollout could not be loaded."
          description="It may have completed and been archived."
          action={
            <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/rollouts" })}>
              Back to rollouts
            </Button>
          }
        />
      </AppShell>
    );
  }

  const data = rollout.data;
  const value = target ?? data.current;
  const isProduction = data.environment === "production";
  const breached = data.successRate < 100 - data.rollbackThreshold;

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Rollouts", to: "/rollouts" },
        { label: data.releaseLabel },
      ]}
    >
      <PageHeader
        title={`${data.appName} · ${data.releaseLabel}`}
        description={`Channel ${data.channelName} · started ${data.startedAt}`}
        meta={
          <>
            <EnvBadge environment={data.environment} />
            <PlatformTag platform={data.platform} />
            <span
              className={`font-mono text-[10px] ${data.status === "paused" ? "text-warning" : "text-success"}`}
            >
              {data.status.toUpperCase()}
            </span>
          </>
        }
        actions={
          data.status === "paused" ? (
            <Button size="sm" disabled={resume.isPending} onClick={() => resume.mutate()}>
              Resume rollout
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={pause.isPending} onClick={() => pause.mutate()}>
              Pause rollout
            </Button>
          )
        }
      />

      {breached ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="text-[12px] font-medium text-danger">
            Failure rate is above the {data.rollbackThreshold}% threshold for this rollout.
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Automatic rollback triggers if the rate stays above the threshold for 10 more minutes.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Devices" value={data.devices.toLocaleString()} />
        <StatCard label="Adoption" value={`${data.adoption}%`} accent progress={data.adoption} />
        <StatCard label="Success rate" value={`${data.successRate}%`} />
        <StatCard label="Failures" value={data.failures} hint={`threshold ${data.rollbackThreshold}%`} />
      </div>

      <SectionCard title="Rollout percentage">
        <div className="space-y-5 p-4">
          <RolloutBar value={data.current} tone={data.status === "paused" ? "warning" : "brand"} />
          <div>
            <div className="flex items-center justify-between text-[12px]">
              <span>New target</span>
              <span className="font-mono">{value}%</span>
            </div>
            <Slider
              aria-label="Rollout percentage"
              className="mt-3"
              value={[value]}
              onValueChange={(next) => setTarget(next[0] ?? 0)}
              min={0}
              max={100}
              step={1}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {isProduction ? (
              <ConfirmAction
                trigger={
                  <Button size="sm" disabled={value === data.current || setPercentage.isPending}>
                    Apply
                  </Button>
                }
                title="Change production rollout"
                description="More production devices will receive this release on their next update check."
                warning={`${Math.round((data.devices * value) / 100).toLocaleString()} devices will be eligible.`}
                confirmLabel="Apply rollout"
                destructive={value > data.current + 25}
                details={[
                  { label: "Current", value: `${data.current}%` },
                  { label: "New", value: `${value}%` },
                  { label: "Channel", value: data.channelName },
                ]}
                onConfirm={async () => {
                  await setPercentage.mutateAsync(value);
                  setTarget(null);
                }}
              />
            ) : (
              <Button
                size="sm"
                disabled={value === data.current || setPercentage.isPending}
                onClick={() => {
                  setPercentage.mutate(value);
                  setTarget(null);
                }}
              >
                Apply
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)} disabled={target === null}>
              Reset
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Rollout configuration">
        <MetaGrid
          items={[
            { label: "Release", value: <span className="font-mono">{data.releaseLabel}</span> },
            { label: "Channel", value: <span className="font-mono">{data.channelName}</span> },
            { label: "Target", value: <span className="font-mono">{data.target}%</span> },
            { label: "Rollback threshold", value: <span className="font-mono">{data.rollbackThreshold}%</span> },
            { label: "Started", value: <span className="font-mono">{data.startedAt}</span> },
            { label: "Status", value: data.status },
          ]}
        />
      </SectionCard>
    </AppShell>
  );
}
