import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { DataTable, type Column } from "@/components/fireota/data-table";
import { EmptyState, PageHeader, SectionCard } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import type { Role, User } from "@/lib/types";
import { permissionsMatrix, teamService } from "@/services";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team — FireOTA" },
      {
        name: "description",
        content: "Invite teammates, assign release permissions and review who can publish to production.",
      },
      { property: "og:title", content: "Team — FireOTA" },
      { property: "og:description", content: "Roles and permissions for your OTA release workspace." },
    ],
  }),
  component: TeamPage,
});

const roleLabels: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  release_manager: "Release manager",
  developer: "Developer",
  viewer: "Viewer",
};

function TeamPage() {
  const client = useQueryClient();
  const team = useQuery(q.team());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("developer");

  const refresh = () => void client.invalidateQueries({ queryKey: ["team"] });

  const invite = useMutation({
    mutationFn: () => teamService.invite(email, role),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}.`);
      setInviteOpen(false);
      setEmail("");
      refresh();
    },
  });
  const changeRole = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Role }) => teamService.changeRole(id, next),
    onSuccess: () => {
      toast.success("Role updated.");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => teamService.remove(id),
    onSuccess: () => {
      toast.success("Member removed from the organization.");
      refresh();
    },
  });

  const columns: Column<User>[] = [
    {
      key: "member",
      header: "Member",
      sortValue: (row) => row.name,
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[10px]"
          >
            {row.initials}
          </span>
          <span>
            <span className="block font-medium">{row.name}</span>
            <span className="block font-mono text-[10px] text-faint">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (row) => row.role,
      render: (row) =>
        row.role === "owner" ? (
          <span className="font-mono text-[11px]">Owner</span>
        ) : (
          <Select value={row.role} onValueChange={(next) => changeRole.mutate({ id: row.id, next: next as Role })}>
            <SelectTrigger className="h-7 w-[160px] text-[11px]" aria-label={`Role for ${row.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {permissionsMatrix.roles
                .filter((item) => item !== "owner")
                .map((item) => (
                  <SelectItem key={item} value={item}>
                    {roleLabels[item]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={`font-mono text-[10px] ${
            row.status === "active" ? "text-success" : row.status === "invited" ? "text-warning" : "text-faint"
          }`}
        >
          {row.status.toUpperCase()}
        </span>
      ),
    },
    { key: "lastActive", header: "Last active", optional: true, render: (row) => <span className="font-mono text-[11px]">{row.lastActive}</span> },
    { key: "joined", header: "Joined", optional: true, render: (row) => <span className="font-mono text-[11px]">{row.joined}</span> },
  ];

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Team" }]}>
      <PageHeader
        title="Team"
        description="Who can publish, promote and roll back releases."
        actions={
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Invite member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a team member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Field label="Email address" htmlFor="invite-email">
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="teammate@company.com"
                    className="h-9 text-[12px]"
                  />
                </Field>
                <Field label="Role" hint="Only owners and admins can grant production publish rights.">
                  <Select value={role} onValueChange={(next) => setRole(next as Role)}>
                    <SelectTrigger className="h-9 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {permissionsMatrix.roles
                        .filter((item) => item !== "owner")
                        .map((item) => (
                          <SelectItem key={item} value={item}>
                            {roleLabels[item]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!email || invite.isPending} onClick={() => invite.mutate()}>
                  {invite.isPending ? "Sending…" : "Send invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <DataTable
        rows={team.data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={team.isLoading}
        error={team.error as Error | null}
        searchPlaceholder="Search members…"
        searchValue={(row) => `${row.name} ${row.email} ${row.role}`}
        emptyState={<EmptyState icon={UserPlus} title="No team members yet." description="Invite the people who ship your app." />}
        rowActions={(row) =>
          row.role === "owner" ? null : (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                  Remove
                </Button>
              }
              title={`Remove ${row.name}`}
              description="They immediately lose access to every application in this organization."
              warning="Any API keys they created keep working until you revoke them separately."
              confirmLabel="Remove member"
              destructive
              details={[
                { label: "Member", value: row.name },
                { label: "Email", value: row.email },
                { label: "Role", value: roleLabels[row.role] },
              ]}
              onConfirm={async () => {
                await remove.mutateAsync(row.id);
              }}
            />
          )
        }
      />

      <SectionCard title="Role permissions" aside={<span className="font-mono text-[10px] text-faint">what each role can do</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                <th className="px-4 py-2 font-medium">Capability</th>
                {permissionsMatrix.roles.map((item) => (
                  <th key={item} className="px-3 py-2 font-medium">
                    {roleLabels[item]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permissionsMatrix.capabilities.map((capability) => (
                <tr key={capability.label}>
                  <td className="px-4 py-2.5">{capability.label}</td>
                  {permissionsMatrix.roles.map((item) => (
                    <td key={item} className="px-3 py-2.5">
                      <span
                        aria-label={capability.allow.includes(item) ? "allowed" : "not allowed"}
                        className={`font-mono text-[12px] ${capability.allow.includes(item) ? "text-success" : "text-faint"}`}
                      >
                        {capability.allow.includes(item) ? "✓" : "—"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
