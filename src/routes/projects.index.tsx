import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Cloud,
  Database,
  Flame,
  Globe,
  HardDrive,
  Lock,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  EmptyState,
  MetaGrid,
  PageHeader,
  SectionCard,
  SkeletonRows,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import { firebaseService, storageService } from "@/services";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Storage Targets — FireOTA" },
      {
        name: "description",
        content: "Connected sovereign storage targets: Cloudflare R2, AWS S3, MinIO, GCS, Azure, and Firebase.",
      },
      { property: "og:title", content: "Storage Targets — FireOTA" },
      { property: "og:description", content: "You own the infrastructure. Bundles live in your own cloud buckets." },
    ],
  }),
  component: ProjectsPage,
});

const statusTone: Record<string, string> = {
  connected: "text-emerald-500",
  degraded: "text-amber-500",
  permission_error: "text-rose-500",
  disconnected: "text-muted-foreground",
};

const providerLabels: Record<string, { name: string; icon: typeof Cloud }> = {
  r2: { name: "Cloudflare R2", icon: Cloud },
  s3: { name: "Amazon S3", icon: HardDrive },
  minio: { name: "MinIO / Self-Hosted", icon: Server },
  gcs: { name: "Google Cloud Storage", icon: Database },
  azure: { name: "Azure Blob Storage", icon: HardDrive },
  firebase: { name: "Google Firebase", icon: Flame },
  external: { name: "Bring Your Own URL", icon: Globe },
};

function ProjectsPage() {
  const client = useQueryClient();
  const { can } = usePermissions();
  const storageTargets = useQuery(q.storageTargets());
  const firebaseProjects = useQuery(q.projects());

  const testTarget = useMutation({
    mutationFn: (id: string) => storageService.test(id),
    onSuccess: (res) => {
      if (res.ok) toast.success("Storage target verified! Write, read and delete tests passed.");
      else toast.error(`Verification issue: ${res.message || "Failed probe"}`);
      void client.invalidateQueries({ queryKey: ["storage-targets"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Failed to test storage target.")),
  });

  const removeTarget = useMutation({
    mutationFn: (id: string) => storageService.remove(id),
    onSuccess: () => {
      toast.success("Storage target removed.");
      void client.invalidateQueries({ queryKey: ["storage-targets"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Could not remove storage target.")),
  });

  const targets = storageTargets.data ?? [];
  const legacyFirebase = (firebaseProjects.data ?? []).filter(
    (fb) => !targets.some((t) => t.id === fb.id || t.bucket === fb.storageBucket),
  );

  const totalCount = targets.length + legacyFirebase.length;
  const isLoading = storageTargets.isLoading || firebaseProjects.isLoading;

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Storage" }]}>
      <PageHeader
        title="Storage Targets"
        description="Zero proprietary bundle hosting. Your bundles stay 100% inside your own cloud buckets (Cloudflare R2, AWS S3, MinIO, GCS, Azure, or Firebase)."
        actions={
          can("project.connect") ? (
            <Button size="sm" asChild>
              <Link to="/projects/connect">
                <Plus className="mr-1.5 size-3.5" />
                Connect Storage
              </Link>
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <SectionCard>
          <SkeletonRows rows={3} cols={4} />
        </SectionCard>
      ) : totalCount === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Cloud}
            title="No storage target connected."
            description="FireOTA never stores your bundles on proprietary infrastructure. Connect Cloudflare R2, AWS S3, MinIO, GCS, or Firebase to start publishing."
            actions={
              <Button size="sm" asChild>
                <Link to="/projects/connect">Connect Storage Target</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {/* Multi-Cloud Storage Targets */}
          {targets.map((target) => {
            const providerInfo = providerLabels[target.provider] ?? { name: target.provider.toUpperCase(), icon: Cloud };
            const Icon = providerInfo.icon;
            const isVerified = target.status === "connected";

            return (
              <SectionCard
                key={target.id}
                title={
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-md border border-border bg-muted/40">
                      <Icon className="size-3.5 text-primary" />
                    </div>
                    <div>
                      <span className="font-semibold text-[13px] text-foreground">{target.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{providerInfo.name}</span>
                    </div>
                  </div>
                }
                aside={
                  <span className={`font-mono text-[10px] uppercase font-semibold ${statusTone[target.status] ?? "text-muted-foreground"}`}>
                    ● {target.status.replace("_", " ")}
                  </span>
                }
              >
                <MetaGrid
                  items={[
                    { label: "Storage Provider", value: providerInfo.name },
                    { label: "Bucket / Container", value: target.bucket ? <span className="font-mono">{target.bucket}</span> : "—" },
                    { label: "Endpoint", value: target.endpoint ? <span className="font-mono text-[11px] truncate">{target.endpoint}</span> : "Default" },
                    { label: "Connected Apps", value: `${target.appsCount ?? 0} application(s)` },
                  ]}
                />

                <div className="flex flex-wrap items-center justify-between border-t border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={testTarget.isPending}
                      onClick={() => testTarget.mutate(target.id)}
                    >
                      <RefreshCw className={`mr-1.5 size-3 ${testTarget.isPending && testTarget.variables === target.id ? "animate-spin" : ""}`} />
                      Test live connectivity
                    </Button>
                    {target.lastVerifiedAt && (
                      <span className="text-[11px] text-muted-foreground">
                        Verified {new Date(target.lastVerifiedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {can("project.delete") && (
                    <ConfirmAction
                      title={`Remove ${target.name}?`}
                      description="This removes the storage target from FireOTA. Any files in your cloud bucket will NOT be deleted."
                      confirmText="Remove target"
                      onConfirm={() => removeTarget.mutate(target.id)}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={removeTarget.isPending}
                      >
                        <Trash2 className="mr-1.5 size-3" />
                        Remove
                      </Button>
                    </ConfirmAction>
                  )}
                </div>
              </SectionCard>
            );
          })}

          {/* Legacy Firebase projects */}
          {legacyFirebase.map((project) => (
            <SectionCard
              key={project.id}
              title={
                <div className="flex items-center gap-2.5">
                  <Flame className="size-4 text-amber-500" />
                  <span className="font-semibold text-[13px]">{project.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{project.firebaseId}</span>
                </div>
              }
              aside={
                <span className={`font-mono text-[10px] uppercase ${statusTone[project.status] ?? "text-muted-foreground"}`}>
                  ● {project.status}
                </span>
              }
            >
              <MetaGrid
                items={[
                  { label: "Provider", value: "Google Firebase (OAuth)" },
                  { label: "Bucket", value: <span className="font-mono">{project.storageBucket}</span> },
                  { label: "Applications", value: project.apps },
                  { label: "Google account", value: <span className="font-mono">{project.googleAccount}</span> },
                ]}
              />
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
