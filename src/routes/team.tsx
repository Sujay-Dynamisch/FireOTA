import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { DataTable, type Column } from "@/components/fireota/data-table";
import { CopyButton, EmptyState, PageHeader, SectionCard } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "@/lib/backend/rbac";
import { q } from "@/lib/queries";
import type { CustomRole, Role, User } from "@/lib/types";
import { permissionsMatrix, teamService } from "@/services";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team — FireOTA" },
      {
        name: "description",
        content:
          "Invite teammates, create custom roles, assign permissions and manage who can publish to production.",
      },
      { property: "og:title", content: "Team — FireOTA" },
      {
        property: "og:description",
        content: "Roles and permissions for your OTA release workspace.",
      },
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

/** Select value: a built-in role name, or "custom:<id>". */
function roleValue(member: Pick<User, "role" | "customRoleId">) {
  return member.customRoleId ? `custom:${member.customRoleId}` : member.role;
}
function parseRoleValue(value: string): { role: Role; customRoleId: string | null } {
  return value.startsWith("custom:")
    ? { role: "viewer", customRoleId: value.slice(7) }
    : { role: value as Role, customRoleId: null };
}

/** Groups permission ids by their area ("release", "app", …) for the role editor. */
const permissionGroups = ALL_PERMISSIONS.reduce<Record<string, string[]>>((acc, p) => {
  const area = p.split(".")[0] ?? "other";
  (acc[area] ??= []).push(p);
  return acc;
}, {});

function RoleSelect({
  value,
  roles,
  onChange,
  canOwner,
  className,
  label,
}: {
  value: string;
  roles: CustomRole[];
  onChange: (value: string) => void;
  canOwner: boolean;
  className?: string;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {permissionsMatrix.roles
          .filter((item) => item !== "owner" || canOwner)
          .map((item) => (
            <SelectItem key={item} value={item}>
              {roleLabels[item]}
            </SelectItem>
          ))}
        {roles.length > 0 ? <SelectSeparator /> : null}
        {roles.map((role) => (
          <SelectItem key={role.id} value={`custom:${role.id}`}>
            {role.name} (custom)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RoleEditor({ role, onDone }: { role?: CustomRole; onDone: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? ["app.read", "release.read", "channel.read"],
  );
  const save = useMutation({
    mutationFn: () =>
      teamService.saveRole({ ...(role ? { id: role.id } : {}), name, description, permissions }),
    onSuccess: () => {
      toast.success(role ? "Role updated." : "Role created.");
      void client.invalidateQueries({ queryKey: ["roles"] });
      void client.invalidateQueries({ queryKey: ["team"] });
      onDone();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the role."),
  });
  const toggle = (p: string, on: boolean) =>
    setPermissions((prev) => (on ? [...new Set([...prev, p])] : prev.filter((x) => x !== p)));

  return (
    <>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role name" htmlFor="role-name">
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="QA lead"
              className="h-9 text-[12px]"
            />
          </Field>
          <Field label="Description" htmlFor="role-description">
            <Input
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Can publish to beta, not production"
              className="h-9 text-[12px]"
            />
          </Field>
        </div>
        {Object.entries(permissionGroups).map(([area, perms]) => (
          <fieldset key={area} className="rounded-md border border-border p-3">
            <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
              {area.replace("_", " ")}
            </legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {perms.map((p) => (
                <label key={p} className="flex items-center gap-2 text-[12px]">
                  <Checkbox
                    checked={permissions.includes(p)}
                    onCheckedChange={(checked) => toggle(p, Boolean(checked))}
                  />
                  <span>
                    {PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS] ?? p.replace(".", " ")}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={name.trim().length < 2 || permissions.length === 0 || save.isPending}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : role ? "Save role" : "Create role"}
        </Button>
      </DialogFooter>
    </>
  );
}

function TeamPage() {
  const client = useQueryClient();
  const { can, role: myRole } = usePermissions();
  const manage = can("team.manage");
  const team = useQuery(q.team());
  const roles = useQuery(q.roles());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("developer");
  const [editing, setEditing] = useState<CustomRole | "new" | null>(null);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["team"] });
    void client.invalidateQueries({ queryKey: ["roles"] });
  };
  const onError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Something went wrong.");

  const invite = useMutation({
    mutationFn: () => {
      const parsed = parseRoleValue(inviteRole);
      return teamService.invite(email, parsed.role, parsed.customRoleId);
    },
    onSuccess: (result) => {
      showDelivery(result);
      setInviteOpen(false);
      setEmail("");
      refresh();
    },
    onError,
  });
  const resend = useMutation({
    mutationFn: (id: string) => teamService.resendInvite(id),
    onSuccess: (result) => showDelivery(result),
    onError,
  });
  const [delivery, setDelivery] = useState<{ email: string; link: string; problem: string | null } | null>(null);
  /** Email sent → toast; otherwise show the link the admin can share and why the email failed. */
  const showDelivery = (result: { email: string; emailSent: boolean; link: string | null; problem: string | null }) => {
    if (result.emailSent) toast.success(`Invitation email sent to ${result.email}.`);
    else if (result.link) setDelivery({ email: result.email, link: result.link, problem: result.problem });
    else toast.error(result.problem ?? "The invitation could not be delivered.");
  };
  const changeRole = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => {
      const parsed = parseRoleValue(value);
      return teamService.changeRole(id, parsed.role, parsed.customRoleId);
    },
    onSuccess: () => {
      toast.success("Role updated.");
      refresh();
    },
    onError,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "suspended" }) =>
      teamService.setStatus(id, status),
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "suspended"
          ? "Member suspended. They can no longer open this workspace."
          : "Member reactivated.",
      );
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => teamService.remove(id),
    onSuccess: () => {
      toast.success("Member removed from the organization.");
      refresh();
    },
    onError,
  });
  const removeRole = useMutation({
    mutationFn: (id: string) => teamService.deleteRole(id),
    onSuccess: () => {
      toast.success("Role deleted.");
      refresh();
    },
    onError,
  });

  const customRoles = roles.data ?? [];

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
            <span className="block font-medium">
              {row.name}
              {row.isYou ? (
                <span className="ml-1.5 font-mono text-[10px] text-faint">(you)</span>
              ) : null}
            </span>
            <span className="block font-mono text-[10px] text-faint">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (row) => row.customRoleName ?? row.role,
      render: (row) =>
        row.role === "owner" || !manage || row.isYou ? (
          <span className="font-mono text-[11px]">
            {row.customRoleName ? `${row.customRoleName} (custom)` : roleLabels[row.role]}
          </span>
        ) : (
          <RoleSelect
            value={roleValue(row)}
            roles={customRoles}
            canOwner={myRole === "owner"}
            onChange={(value) => changeRole.mutate({ id: row.id, value })}
            className="h-7 w-[190px] text-[11px]"
            label={`Role for ${row.name}`}
          />
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={`font-mono text-[10px] ${
            row.status === "active"
              ? "text-success"
              : row.status === "invited"
                ? "text-warning"
                : "text-danger"
          }`}
        >
          {row.status.toUpperCase()}
        </span>
      ),
    },
    {
      key: "lastActive",
      header: "Last active",
      optional: true,
      render: (row) => <span className="font-mono text-[11px]">{row.lastActive}</span>,
    },
    {
      key: "joined",
      header: "Joined",
      optional: true,
      render: (row) => <span className="font-mono text-[11px]">{row.joined}</span>,
    },
  ];

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Team" }]}>
      <PageHeader
        title="Team"
        description="Members, custom roles and exactly what each role may do."
        actions={
          manage ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
                New role
              </Button>
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
                    <Field label="Role" hint="Built-in roles or a custom role you created.">
                      <RoleSelect
                        value={inviteRole}
                        roles={customRoles}
                        canOwner={myRole === "owner"}
                        onChange={setInviteRole}
                        className="h-9 text-[12px]"
                        label="Role"
                      />
                    </Field>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!email || invite.isPending}
                      loading={invite.isPending}
                      onClick={() => invite.mutate()}
                    >
                      {invite.isPending ? "Sending…" : "Send invitation"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null
        }
      />

      <Dialog open={delivery !== null} onOpenChange={(open) => !open && setDelivery(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share the invitation with {delivery?.email}</DialogTitle>
          </DialogHeader>
          {delivery?.problem ? (
            <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-[12px] text-warning">
              {delivery.problem}
            </p>
          ) : null}
          <p className="text-[12px] text-muted-foreground">
            Send this one-time link to them (e.g. on Slack). Opening it signs them in and they join this workspace
            automatically.
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/50 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{delivery?.link}</code>
            {delivery ? <CopyButton value={delivery.link} label="Copy link" /> : null}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setDelivery(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing && editing !== "new" ? `Edit ${editing.name}` : "Create a custom role"}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <RoleEditor
              key={editing === "new" ? "new" : editing.id}
              {...(editing !== "new" ? { role: editing } : {})}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="roles">Custom roles ({customRoles.length})</TabsTrigger>
          <TabsTrigger value="matrix">Built-in roles</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-3">
          <DataTable
            rows={team.data ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            isLoading={team.isLoading}
            error={team.error as Error | null}
            searchPlaceholder="Search members…"
            searchValue={(row) =>
              `${row.name} ${row.email} ${row.role} ${row.customRoleName ?? ""}`
            }
            emptyState={
              <EmptyState
                icon={UserPlus}
                title="No team members yet."
                description="Invite the people who ship your app."
              />
            }
            rowActions={(row) =>
              row.role === "owner" || !manage || row.isYou ? null : (
                <span className="flex gap-1">
                  {row.status === "invited" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={resend.isPending}
                      loading={resend.isPending && resend.variables === row.id}
                      onClick={() => resend.mutate(row.id)}
                    >
                      Resend invite
                    </Button>
                  ) : null}
                  {row.status !== "invited" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={setStatus.isPending}
                      loading={setStatus.isPending && setStatus.variables?.id === row.id}
                      onClick={() =>
                        setStatus.mutate({
                          id: row.id,
                          status: row.status === "suspended" ? "active" : "suspended",
                        })
                      }
                    >
                      {row.status === "suspended" ? "Reactivate" : "Suspend"}
                    </Button>
                  ) : null}
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                        {row.status === "invited" ? "Cancel invite" : "Remove"}
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
                      { label: "Role", value: row.customRoleName ?? roleLabels[row.role] },
                    ]}
                    onConfirm={async () => {
                      await remove.mutateAsync(row.id);
                    }}
                  />
                </span>
              )
            }
          />
        </TabsContent>

        <TabsContent value="roles" className="mt-3">
          {customRoles.length === 0 ? (
            <SectionCard>
              <EmptyState
                icon={ShieldCheck}
                title="No custom roles yet."
                description="Create roles such as “QA lead” or “Beta publisher” with exactly the permissions they need."
                {...(manage
                  ? {
                      actions: (
                        <Button size="sm" onClick={() => setEditing("new")}>
                          Create a role
                        </Button>
                      ),
                    }
                  : {})}
              />
            </SectionCard>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {customRoles.map((role) => (
                <SectionCard
                  key={role.id}
                  title={role.name}
                  aside={
                    <span className="font-mono text-[10px] text-faint">
                      {role.members} member(s)
                    </span>
                  }
                >
                  <div className="space-y-3 p-4">
                    {role.description ? (
                      <p className="text-[12px] text-muted-foreground">{role.description}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((p) => (
                        <span
                          key={p}
                          className="rounded-sm border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    {manage ? (
                      <div className="flex gap-2 border-t border-border pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => setEditing(role)}
                        >
                          Edit permissions
                        </Button>
                        <ConfirmAction
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px] text-danger"
                              disabled={role.members > 0}
                            >
                              Delete
                            </Button>
                          }
                          title={`Delete ${role.name}`}
                          description="The role is removed. Members must be moved to another role first."
                          confirmLabel="Delete role"
                          destructive
                          onConfirm={async () => {
                            await removeRole.mutateAsync(role.id);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-3">
          <SectionCard
            title="Role permissions"
            aside={
              <span className="font-mono text-[10px] text-faint">
                what each built-in role can do
              </span>
            }
          >
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
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
