import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Database, Lock } from "lucide-react";
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
import { CheckList } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import { firebaseService } from "@/services";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Firebase projects — FireOTA" },
      {
        name: "description",
        content: "Connected Firebase projects, storage buckets, granted permissions and connection health.",
      },
      { property: "og:title", content: "Firebase projects — FireOTA" },
      { property: "og:description", content: "Your own Firebase projects power every OTA download." },
    ],
  }),
  component: ProjectsPage,
});

const statusTone: Record<string, string> = {
  connected: "text-success",
  degraded: "text-warning",
  expired: "text-warning",
  disconnected: "text-danger",
};

function ProjectsPage() {
  const client = useQueryClient();
  const { can } = usePermissions();
  const projects = useQuery(q.projects());

  const verify = useMutation({
    mutationFn: (id: string) => firebaseService.verify(id),
    onSuccess: (project) => {
      if (project.status === "connected") toast.success("Connection verified. Storage is writable.");
      else if (!project.storageBucket) toast.warning("No Storage bucket found. Set up Storage in the Firebase console, then verify again.");
      else toast.warning("Connected, but FireOTA cannot write to the Storage bucket. Check the Google account's permissions.");
      void client.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      toast.error(friendlyError(error, "Verification failed."));
      void client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => firebaseService.disconnect(id),
    onSuccess: () => {
      toast.success("Project disconnected. Existing bundles stay in your bucket.");
      void client.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => toast.error(friendlyError(error, "Could not disconnect the project.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => firebaseService.remove(id),
    onSuccess: () => {
      toast.success("Project removed from FireOTA. Files in your bucket were not touched.");
      void client.invalidateQueries({ queryKey: ["projects"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(friendlyError(error, "Could not remove the project.")),
  });

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Projects" }]}>
      <PageHeader
        title="Firebase projects"
        description="You own the infrastructure. Bundles live in your buckets and you pay Google directly."
        actions={
          can("project.connect") ? (
            <Button size="sm" asChild>
              <Link to="/projects/connect">Connect project</Link>
            </Button>
          ) : null
        }
      />

      {projects.isLoading ? (
        <SectionCard>
          <SkeletonRows rows={3} cols={4} />
        </SectionCard>
      ) : (projects.data ?? []).length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Database}
            title="No Firebase project connected."
            description="FireOTA stores every bundle in your own Firebase project — connect one to start."
            actions={
              <Button size="sm" asChild>
                <Link to="/projects/connect">Connect Firebase</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {(projects.data ?? []).map((project) => (
            <SectionCard
              key={project.id}
              title={
                <span className="flex items-center gap-2">
                  {project.name}
                  <span className="font-mono text-[10px] text-faint">{project.firebaseId}</span>
                </span>
              }
              aside={
                <span className={`font-mono text-[10px] ${statusTone[project.status] ?? "text-faint"}`}>
                  {project.status.toUpperCase()} · verified {project.lastVerified}
                </span>
              }
            >
              <MetaGrid
                items={[
                  { label: "Storage bucket", value: <span className="font-mono">{project.storageBucket}</span> },
                  { label: "Cloud Storage", value: project.storage === "enabled" ? "Enabled" : "Disabled" },
                  { label: "Applications", value: project.apps },
                  { label: "Google account", value: <span className="font-mono">{project.googleAccount}</span> },
                ]}
              />
              <div className="border-t border-border p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Granted permissions</p>
                <div className="mt-2">
                  <CheckList items={project.permissions} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={verify.isPending}
                  loading={verify.isPending && verify.variables === project.id}
                  onClick={() => verify.mutate(project.id)}
                >
                  {verify.isPending ? "Verifying…" : "Verify connection"}
                </Button>
                {project.apps > 0 && (can("project.disconnect") || can("project.delete")) ? (
                  // The server refuses both while apps use the project, so explain the order up front.
                  <p className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden />
                    Used by {project.apps} app{project.apps === 1 ? "" : "s"}. To remove it, archive their live updates, then delete
                    the {project.apps === 1 ? "app" : "apps"}.
                    <Link to="/apps" className="font-medium text-brand hover:underline">
                      Open Apps
                    </Link>
                  </p>
                ) : null}
                {project.apps === 0 && can("project.disconnect") && project.status !== "disconnected" ? (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                      Disconnect
                    </Button>
                  }
                  title="Disconnect this Firebase project"
                  description="FireOTA stops using this project until you reconnect it."
                  warning="Bundles already in your bucket are not deleted."
                  confirmLabel="Disconnect project"
                  destructive
                  requireTyped="DISCONNECT"
                  details={[
                    { label: "Project", value: project.name },
                    { label: "Bucket", value: project.storageBucket },
                    { label: "Applications", value: project.apps },
                  ]}
                  onConfirm={async () => {
                    await disconnect.mutateAsync(project.id);
                  }}
                />
                ) : null}
                {project.apps === 0 && can("project.delete") ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="ml-auto h-7 text-[11px] text-danger">
                        Remove project
                      </Button>
                    }
                    title="Remove this Firebase project from FireOTA"
                    description="The project and its stored Google authorization are deleted from this workspace. Your Firebase project itself and every file in its bucket are left untouched."
                    confirmLabel="Remove project"
                    destructive
                    requireTyped="REMOVE"
                    details={[
                      { label: "Project", value: project.name },
                      { label: "Firebase ID", value: project.firebaseId },
                    ]}
                    onConfirm={async () => {
                      await remove.mutateAsync(project.id);
                    }}
                  />
                ) : null}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
