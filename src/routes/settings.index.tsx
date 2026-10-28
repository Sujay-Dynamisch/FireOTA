import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  KeyRound,
  Plug,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { CiLogo, Icons8Credit } from "@/components/fireota/ci-logos";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import { authService, notificationsService, organizationService } from "@/services";

export const Route = createFileRoute("/settings/")({
  head: () => ({
    meta: [
      { title: "Settings — FireOTA" },
      {
        name: "description",
        content: "Organization details, release safeguards, notification preferences and account security for FireOTA.",
      },
      { property: "og:title", content: "Settings — FireOTA" },
      { property: "og:description", content: "Organization, safeguards and notification settings." },
    ],
  }),
  component: SettingsPage,
});

const SECTIONS: { value: string; label: string; icon: LucideIcon; hint: string }[] = [
  { value: "organization", label: "Organization", icon: Building2, hint: "Name, workspace ID and defaults" },
  { value: "safeguards", label: "Release safeguards", icon: ShieldCheck, hint: "Approvals and automatic rollback" },
  { value: "notifications", label: "Notifications", icon: Bell, hint: "What you get notified about" },
  { value: "account", label: "Account", icon: UserRound, hint: "Password and account deletion" },
  { value: "integrations", label: "Integrations", icon: Plug, hint: "API keys, CI/CD and webhooks" },
];

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-[18px] font-bold tracking-tight">{title}</h2>
      <p className="text-[12px] text-muted-foreground">{description}</p>
    </div>
  );
}

/** A red-bordered card for irreversible actions. */
function DangerCard({ title, description, action }: { title: string; description: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-danger/30 bg-danger/[0.04] p-4">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
          <Trash2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{title}</p>
          <div className="text-[12px] text-muted-foreground">{description}</div>
        </div>
      </div>
      {action}
    </div>
  );
}

function NotificationPreferences() {
  const client = useQueryClient();
  const prefs = useQuery(q.notificationPrefs());
  const save = useMutation({
    mutationFn: (next: Record<string, boolean>) => notificationsService.savePrefs(next),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notification-prefs"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(friendlyError(error, "Could not save preferences.")),
  });
  const current = Object.fromEntries((prefs.data ?? []).map((p) => [p.key, p.enabled]));
  return (
    <SectionCard title="Notification preferences" aside={<span className="font-mono text-[10px] text-faint">applies to you only</span>}>
      {prefs.isLoading ? (
        <SkeletonRows rows={4} cols={2} />
      ) : (
        <ul className="divide-y divide-border">
          {(prefs.data ?? []).map((pref) => (
            <li key={pref.key} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-[12px] font-medium">{pref.label}</p>
                <p className="text-[11px] text-muted-foreground">{pref.hint}</p>
              </div>
              <Switch
                checked={pref.enabled}
                disabled={save.isPending}
                onCheckedChange={(enabled) => save.mutate({ ...current, [pref.key]: enabled })}
                aria-label={pref.label}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * "Delete account": shows what has to happen first (checked on the server), what gets deleted,
 * and only enables the button once nothing blocks it and DELETE is typed.
 */
function DeleteAccount() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const plan = useQuery({
    queryKey: ["account-deletion-plan"],
    queryFn: () => authService.deletionPlan(),
    enabled: open,
    staleTime: 0,
  });
  const remove = useMutation({
    mutationFn: () => authService.deleteAccount(),
    onSuccess: () => {
      client.clear();
      toast.success("Your account was deleted. Thanks for trying FireOTA.");
      void navigate({ to: "/login" });
    },
    onError: (error) => {
      toast.error(friendlyError(error, "Could not delete your account."));
      void plan.refetch();
    },
  });
  const blockers = plan.data?.blockers ?? [];
  const ready = plan.isSuccess && blockers.length === 0;

  return (
    <>
      <DangerCard
        title="Delete account"
        description="Permanently delete your FireOTA login and personal data. You'll be asked to confirm."
        action={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setTyped("");
              setOpen(true);
            }}
          >
            Delete account
          </Button>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="flex items-center gap-2 text-[17px]">
            <AlertTriangle className="size-5 text-danger" aria-hidden /> Delete your account
          </DialogTitle>
          <DialogDescription className="text-[13px]">This can't be undone.</DialogDescription>

          {plan.isLoading ? (
            <SkeletonRows rows={3} cols={1} />
          ) : plan.isError ? (
            <p className="text-[13px] text-danger">{friendlyError(plan.error, "Could not check your account. Try again.")}</p>
          ) : blockers.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[13px]">Before you can delete your account:</p>
              <ol className="space-y-2.5">
                {blockers.map((blocker, i) => (
                  <li key={blocker.id} className="rounded-xl border border-warning/30 bg-warning/[0.06] p-3">
                    <p className="flex items-center gap-2 text-[13px] font-semibold">
                      <span className="grid size-5 place-items-center rounded-full bg-warning/20 font-mono text-[10px] text-warning">
                        {i + 1}
                      </span>
                      {blocker.title}
                    </p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{blocker.detail}</p>
                    <Button variant="outline" size="sm" className="mt-2 h-7 gap-1 text-[11px]" asChild>
                      <Link to={blocker.to} onClick={() => setOpen(false)}>
                        {blocker.id === "transfer" ? "Open Team" : "Open Releases"} <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ol>
            </div>
          ) : plan.data ? (
            <div className="space-y-3 text-[13px]">
              <p className="font-medium">This will permanently delete:</p>
              <ul className="space-y-1.5">
                {[
                  "Your login, profile and notification settings",
                  "Your AI assistant conversations",
                  ...(plan.data.workspace
                    ? plan.data.deletesWorkspace && plan.data.counts
                      ? [
                          `The workspace ${plan.data.workspace.name}: ${plan.data.counts.apps} app${plan.data.counts.apps === 1 ? "" : "s"}, ${plan.data.counts.releases} release record${plan.data.counts.releases === 1 ? "" : "s"}, ${plan.data.counts.firebaseProjects} Firebase connection${plan.data.counts.firebaseProjects === 1 ? "" : "s"}, API keys and audit history`,
                        ]
                      : [`Your membership of ${plan.data.workspace.name} (the workspace and its apps stay for your teammates)`]
                    : []),
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="rounded-xl border border-border bg-surface-2/40 p-3 text-[12px] text-muted-foreground">
                Update files you uploaded stay in your own Firebase Storage bucket. Delete the <span className="font-mono">fireota/</span>{" "}
                folder in the Firebase console if you don't need them.
              </p>
              <Field label="Type DELETE to confirm" htmlFor="confirm-delete-account">
                <Input
                  id="confirm-delete-account"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  className="h-9 font-mono text-[12px]"
                />
              </Field>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!ready || typed !== "DELETE" || remove.isPending}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete my account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { can, role } = usePermissions();
  const organization = useQuery(q.session());
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("");
  const [defaultChannel, setDefaultChannel] = useState("");
  const [autoRollback, setAutoRollback] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const channels = useQuery(q.channels());

  const org = organization.data?.organization ?? null;
  const user = organization.data?.user ?? null;
  const channelNames = Array.from(
    new Set([...(channels.data ?? []).map((channel) => channel.name), ...(org?.defaultChannel ? [org.defaultChannel] : [])]),
  );
  const initials = String(user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Settings" }]}>
      {/* Profile header */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/[0.08] via-surface/40 to-transparent p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-14 rounded-2xl object-cover ring-2 ring-background" />
          ) : (
            <span className="grid size-14 place-items-center rounded-2xl bg-brand font-display text-[20px] font-bold text-white ring-2 ring-background">
              {initials}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] font-bold tracking-tight">Settings</h1>
            <p className="truncate text-[13px] text-muted-foreground">
              {user ? `${user.name || user.email} · ${user.email}` : "Loading your account…"}
            </p>
          </div>
          {org ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-[12px]">
              <Building2 className="size-3.5 text-brand" aria-hidden />
              {org.name}
              <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold capitalize text-brand">{role}</span>
            </span>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="organization" orientation="vertical" className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <TabsList className="h-auto w-full flex-row flex-wrap justify-start gap-1 bg-transparent p-0 lg:sticky lg:top-4 lg:flex-col lg:items-stretch lg:self-start">
          {SECTIONS.map(({ value, label, icon: Icon, hint }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="group justify-start gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left text-[13px] data-[state=active]:border-brand/30 data-[state=active]:bg-brand/10 data-[state=active]:text-brand data-[state=active]:shadow-none"
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">{label}</span>
                <span className="hidden truncate text-[11px] font-normal text-muted-foreground lg:block">{hint}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="organization" className="mt-0 space-y-4">
            <SectionHeading title="Organization" description="How your workspace appears to your team, the CLI and webhooks." />
            <SectionCard title="Organization details">
              {!org ? (
                <SkeletonRows rows={3} cols={2} />
              ) : (
                <div className="space-y-4 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Organization name" htmlFor="org-name">
                      <Input
                        id="org-name"
                        value={name || org.name}
                        onChange={(event) => setName(event.target.value)}
                        className="h-9 text-[12px]"
                      />
                    </Field>
                    <Field
                      label="Workspace ID"
                      htmlFor="org-slug"
                      hint="Unique ID shown by `fireota whoami`, sent in webhook payloads, and typed to confirm deleting the workspace."
                    >
                      <Input
                        id="org-slug"
                        value={slug || org.slug}
                        readOnly={!can("org.update")}
                        onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                    <Field label="Timezone">
                      <Select value={timezone || org.timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="h-9 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                          <SelectItem value="America/New_York">America/New_York</SelectItem>
                          <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Default channel" htmlFor="org-default-channel" hint="Pre-selected when creating a release.">
                      <Select
                        value={defaultChannel || org.defaultChannel}
                        onValueChange={setDefaultChannel}
                        disabled={!can("org.update")}
                      >
                        <SelectTrigger id="org-default-channel" className="h-9 font-mono text-[12px]">
                          <SelectValue placeholder="Select a channel" />
                        </SelectTrigger>
                        <SelectContent>
                          {channelNames.map((channelName) => (
                            <SelectItem key={channelName} value={channelName} className="font-mono text-[12px]">
                              {channelName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {can("org.update") ? (
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await organizationService.update({
                            name: name || org.name,
                            timezone: timezone || org.timezone,
                            ...(slug && slug !== org.slug ? { slug } : {}),
                            ...(defaultChannel && defaultChannel !== org.defaultChannel ? { defaultChannel } : {}),
                          });
                          toast.success("Organization settings saved.");
                          setSlug("");
                          setDefaultChannel("");
                          void client.invalidateQueries({ queryKey: ["session"] });
                        } catch (error) {
                          toast.error(friendlyError(error, "Could not save the settings."));
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Only owners and admins can change workspace settings.</p>
                  )}
                </div>
              )}
            </SectionCard>

            {role === "owner" ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-danger">Danger zone</p>
                <DangerCard
                  title="Delete organization"
                  description="Removes every app, release record and API key. Live updates must be archived first. Bundles stay in your Firebase bucket."
                  action={
                    <ConfirmAction
                      trigger={
                        <Button variant="destructive" size="sm">
                          Delete organization
                        </Button>
                      }
                      title="Delete this organization"
                      description="This cannot be undone. Devices stop receiving updates immediately."
                      warning="All release history, channels, rollouts and audit logs are permanently removed."
                      confirmLabel="Delete organization"
                      destructive
                      requireTyped={org?.slug ?? "DELETE"}
                      details={[
                        { label: "Organization", value: org?.name ?? "—" },
                        { label: "Type to confirm", value: <span className="font-mono">{org?.slug ?? ""}</span> },
                      ]}
                      onConfirm={async () => {
                        try {
                          await organizationService.remove(org?.slug ?? "");
                          toast.success("Workspace deleted.");
                          client.clear();
                          void navigate({ to: "/onboarding" });
                        } catch (error) {
                          toast.error(friendlyError(error, "Could not delete the workspace."));
                        }
                      }}
                    />
                  }
                />
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="safeguards" className="mt-0 space-y-4">
            <SectionHeading title="Release safeguards" description="Extra checks before and after an update reaches production." />
            <SectionCard title="Production safeguards">
              <ul className="divide-y divide-border">
                <li className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[12px] font-medium">Require approval for production publishes</p>
                    <p className="text-[11px] text-muted-foreground">
                      A second admin or release manager must approve before a production release goes live.
                    </p>
                  </div>
                  <Switch
                    checked={org?.requirePublishConfirmation ?? true}
                    disabled={!can("org.update")}
                    onCheckedChange={async (value) => {
                      try {
                        await organizationService.update({ requirePublishConfirmation: value });
                        void client.invalidateQueries({ queryKey: ["session"] });
                      } catch (error) {
                        toast.error(friendlyError(error, "Could not save."));
                      }
                    }}
                    aria-label="Require approval for production publishes"
                  />
                </li>
                <li className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[12px] font-medium">Automatic rollback</p>
                    <p className="text-[11px] text-muted-foreground">
                      Roll back automatically when the install failure rate stays above 5% for 10 minutes.
                    </p>
                  </div>
                  <Switch checked={autoRollback} onCheckedChange={setAutoRollback} aria-label="Automatic rollback" />
                </li>
              </ul>
            </SectionCard>
          </TabsContent>

          <TabsContent value="notifications" className="mt-0 space-y-4">
            <SectionHeading title="Notifications" description="Choose which events reach your inbox and the bell menu." />
            <NotificationPreferences />
          </TabsContent>

          <TabsContent value="account" className="mt-0 space-y-4">
            <SectionHeading title="Account" description="Your sign-in details. These apply to you, not the whole workspace." />
            <SectionCard title="Password" aside={<KeyRound className="size-4 text-faint" aria-hidden />}>
              <div className="space-y-4 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Current password" htmlFor="current-password">
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="h-9 text-[12px]"
                    />
                  </Field>
                  <Field label="New password" htmlFor="new-password" hint="At least 12 characters.">
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-9 text-[12px]"
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Signed in with Google only? Leave the current password empty to add a password to your account.
                </p>
                <Button
                  size="sm"
                  disabled={changingPassword || !newPassword}
                  onClick={async () => {
                    setChangingPassword(true);
                    try {
                      await authService.changePassword(currentPassword, newPassword);
                      setCurrentPassword("");
                      setNewPassword("");
                      toast.success("Password updated.");
                    } catch (error) {
                      toast.error(friendlyError(error, "Could not update the password."));
                    } finally {
                      setChangingPassword(false);
                    }
                  }}
                >
                  {changingPassword ? "Updating…" : "Update password"}
                </Button>
              </div>
            </SectionCard>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-danger">Danger zone</p>
              <DeleteAccount />
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="mt-0 space-y-4">
            <SectionHeading title="Integrations" description="Connect FireOTA to your pipelines and tools." />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "API keys", description: "Programmatic access for CI and scripts.", to: "/settings/api-keys", icon: KeyRound },
                { label: "CI/CD", description: "Publish releases from GitHub Actions, GitLab CI, Bitrise and more.", to: "/settings/ci-cd", icon: null },
                { label: "Webhooks", description: "Send release events to Slack, PagerDuty or your own endpoint.", to: "/settings/webhooks", icon: Plug },
              ].map(({ label, description, to, icon: Icon }) => (
                <Link
                  key={label}
                  to={to as never}
                  className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                >
                  <span className="flex items-center gap-1.5">
                    {Icon ? (
                      <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
                        <Icon className="size-5" aria-hidden />
                      </span>
                    ) : (
                      (["github", "gitlab", "bitrise"] as const).map((tool) => (
                        <span key={tool} className="grid size-10 place-items-center rounded-xl bg-surface-2/70">
                          <CiLogo tool={tool} className="size-6" />
                        </span>
                      ))
                    )}
                  </span>
                  <span>
                    <span className="flex items-center gap-1 text-[13px] font-semibold">
                      {label}
                      <ArrowRight className="size-3.5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">{description}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Icons8Credit />
          </TabsContent>
        </div>
      </Tabs>
    </AppShell>
  );
}
