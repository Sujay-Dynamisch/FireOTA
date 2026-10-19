import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { DataTable, type Column } from "@/components/fireota/data-table";
import { CopyButton, EmptyState, EnvBadge, ErrorState, PageHeader } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import type { ApiKey } from "@/lib/types";
import { apiKeysService } from "@/services";

export const Route = createFileRoute("/settings/api-keys")({
  head: () => ({
    meta: [
      { title: "API keys — FireOTA" },
      {
        name: "description",
        content: "Create, scope and revoke API keys used by CI pipelines and scripts to publish OTA releases.",
      },
      { property: "og:title", content: "API keys — FireOTA" },
      { property: "og:description", content: "Scoped API keys for publishing OTA releases." },
    ],
  }),
  component: ApiKeysPage,
});

/** Must match API_SCOPES on the server. */
const allScopes: { scope: string; label: string }[] = [
  { scope: "release.read", label: "Read releases" },
  { scope: "release.write", label: "Create releases and upload bundles" },
  { scope: "release.publish", label: "Publish, pause and roll back" },
  { scope: "rollout.write", label: "Change rollout percentage" },
  { scope: "app.read", label: "Read applications" },
  { scope: "analytics.read", label: "Read analytics" },
  { scope: "audit.read", label: "Read the audit log" },
];

function ApiKeysPage() {
  const client = useQueryClient();
  const { can, loading } = usePermissions();
  const allowed = can("api_key.read");
  const keys = useQuery({ ...q.apiKeys(), enabled: allowed });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [scopes, setScopes] = useState<string[]>(["release.read", "release.write", "release.publish"]);
  const [issued, setIssued] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiKeysService.create({
        name,
        environment,
        scopes,
        ...(expiresInDays !== "never" ? { expiresInDays: Number(expiresInDays) } : {}),
      }),
    onSuccess: (result) => {
      setIssued(result.token);
      void client.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create the key."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiKeysService.remove(id),
    onSuccess: () => {
      toast.success("Key deleted.");
      void client.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete the key."),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysService.revoke(id),
    onSuccess: () => {
      toast.success("Key revoked. Requests using it now fail with 401.");
      void client.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const columns: Column<ApiKey>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.name,
      render: (row) => (
        <span>
          <span className="block font-medium">{row.name}</span>
          {row.prefix ? <span className="block font-mono text-[10px] text-faint">{row.prefix}…</span> : null}
        </span>
      ),
    },
    { key: "environment", header: "Environment", render: (row) => <EnvBadge environment={row.environment} /> },
    {
      key: "scopes",
      header: "Scopes",
      render: (row) => <span className="font-mono text-[10px] text-muted-foreground">{row.scopes.join(" ")}</span>,
    },
    { key: "created", header: "Created", optional: true, render: (row) => <span className="font-mono text-[11px]">{row.created}</span> },
    {
      key: "lastUsed",
      header: "Last used",
      render: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {row.lastUsed ?? "never"}
          {row.lastUsedIp ? <span className="block text-[10px] text-faint">{row.lastUsedIp}</span> : null}
        </span>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      optional: true,
      render: (row) => <span className="font-mono text-[11px] text-muted-foreground">{row.expires ?? "never"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={`font-mono text-[10px] ${
            row.status === "active" ? "text-success" : row.status === "expired" ? "text-warning" : "text-faint"
          }`}
        >
          {row.status.toUpperCase()}
        </span>
      ),
    },
  ];

  if (!loading && !allowed) {
    return (
      <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Settings", to: "/settings" }, { label: "API keys" }]}>
        <ErrorState title="Admins only" description="Only workspace owners and admins can view and manage API keys." />
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Settings", to: "/settings" },
        { label: "API keys" },
      ]}
    >
      <PageHeader
        title="API keys"
        description="Keys are shown once at creation. Store them in your CI secret manager. Only admins can see this page."
        actions={
          can("api_key.create") ? (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) {
                setIssued(null);
                setName("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">Create key</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{issued ? "Copy your API key" : "Create an API key"}</DialogTitle>
              </DialogHeader>
              {issued ? (
                <div className="space-y-3">
                  <p className="text-[12px] text-muted-foreground">
                    This is the only time the key is shown. Copy it now and store it in your secret manager as{" "}
                    <code className="font-mono">FIREOTA_API_KEY</code>.
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/50 p-3">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{issued}</code>
                    <CopyButton value={issued} label="Copy key" />
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      void navigator.clipboard?.writeText(issued).then(() => toast.success("Key copied to the clipboard."));
                    }}
                  >
                    Copy key to clipboard
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(false)}>
                    I have stored it — close
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <Field label="Key name" htmlFor="key-name" hint="Name it after the system that will use it.">
                      <Input
                        id="key-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="GitHub Actions — ledger"
                        className="h-9 text-[12px]"
                      />
                    </Field>
                    <Field label="Environment">
                      <Select value={environment} onValueChange={setEnvironment}>
                        <SelectTrigger className="h-9 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="production">production</SelectItem>
                          <SelectItem value="beta">beta</SelectItem>
                          <SelectItem value="staging">staging</SelectItem>
                          <SelectItem value="development">development</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Expires">
                      <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                        <SelectTrigger className="h-9 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">in 30 days</SelectItem>
                          <SelectItem value="90">in 90 days</SelectItem>
                          <SelectItem value="365">in 1 year</SelectItem>
                          <SelectItem value="never">never</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Scopes" hint="Grant only what the pipeline needs.">
                      <div className="space-y-1.5">
                        {allScopes.map(({ scope, label }) => (
                          <label key={scope} className="flex items-center gap-2 text-[12px]">
                            <Checkbox
                              checked={scopes.includes(scope)}
                              onCheckedChange={(checked) =>
                                setScopes((prev) => (checked ? [...prev, scope] : prev.filter((s) => s !== scope)))
                              }
                            />
                            <span>{label}</span>
                            <code className="ml-auto font-mono text-[10px] text-faint">{scope}</code>
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!name || scopes.length === 0 || create.isPending} loading={create.isPending} onClick={() => create.mutate()}>
                      {create.isPending ? "Creating…" : "Create key"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
          ) : null
        }
      />

      <DataTable
        rows={keys.data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={keys.isLoading}
        error={keys.error as Error | null}
        searchPlaceholder="Search keys…"
        searchValue={(row) => `${row.name} ${row.scopes.join(" ")} ${row.environment}`}
        emptyState={
          <EmptyState
            icon={KeyRound}
            title="No API keys yet."
            description="Create a scoped key to publish releases from CI."
          />
        }
        rowActions={(row) =>
          !can("api_key.revoke") ? null : row.status !== "active" ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                  Delete
                </Button>
              }
              title={`Delete ${row.name}`}
              description="The key is removed permanently. It already cannot be used."
              confirmLabel="Delete key"
              destructive
              details={[
                { label: "Key", value: row.name },
                { label: "Status", value: row.status },
              ]}
              onConfirm={async () => {
                await remove.mutateAsync(row.id);
              }}
            />
          ) : (
            <span className="flex gap-1">
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                  Revoke
                </Button>
              }
              title={`Revoke ${row.name}`}
              description="Any pipeline or script using this key stops working immediately."
              warning={row.environment === "production" ? "This key publishes to production." : undefined}
              confirmLabel="Revoke key"
              destructive
              requireTyped="REVOKE"
              details={[
                { label: "Key", value: row.name },
                { label: "Environment", value: row.environment },
                { label: "Last used", value: row.lastUsed ?? "never" },
              ]}
              onConfirm={async () => {
                await revoke.mutateAsync(row.id);
              }}
            />
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                  Delete
                </Button>
              }
              title={`Delete ${row.name}`}
              description="The key stops working immediately and is removed permanently."
              confirmLabel="Delete key"
              destructive
              requireTyped="DELETE"
              details={[
                { label: "Key", value: row.name },
                { label: "Last used", value: row.lastUsed ?? "never" },
              ]}
              onConfirm={async () => {
                await remove.mutateAsync(row.id);
              }}
            />
            </span>
          )
        }
      />
    </AppShell>
  );
}
