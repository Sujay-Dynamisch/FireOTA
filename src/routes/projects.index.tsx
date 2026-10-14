import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
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
      toast.error(error instanceof Error ? error.message : "Verification failed.");
      void client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => firebaseService.disconnect(id),
    onSuccess: () => {
      toast.success("Project disconnected. Existing bundles stay in your bucket.");
      void client.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Projects" }]}>
      <PageHeader
        title="Firebase projects"
        description="You own the infrastructure. Bundles live in your buckets and you pay Google directly."
        actions={
          <Button size="sm" asChild>
            <Link to="/projects/connect">Connect project</Link>
          </Button>
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
                  { label: "Firestore", value: project.firestore === "enabled" ? "Enabled" : "Disabled" },
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
                  onClick={() => verify.mutate(project.id)}
                >
                  {verify.isPending ? "Verifying…" : "Verify connection"}
                </Button>
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                      Disconnect
                    </Button>
                  }
                  title="Disconnect this Firebase project"
                  description="Applications using this project stop receiving new releases until it is reconnected."
                  warning={`${project.apps} application(s) currently publish to this project. Bundles already in your bucket are not deleted.`}
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
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
