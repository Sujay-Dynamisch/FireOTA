import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { CiLogo, Icons8Credit } from "@/components/fireota/ci-logos";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { PageHeader, SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
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

function NotificationPreferences() {
  const client = useQueryClient();
  const prefs = useQuery(q.notificationPrefs());
  const save = useMutation({
    mutationFn: (next: Record<string, boolean>) => notificationsService.savePrefs(next),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notification-prefs"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save preferences."),
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
  const channelNames = Array.from(
    new Set([...(channels.data ?? []).map((channel) => channel.name), ...(org?.defaultChannel ? [org.defaultChannel] : [])]),
  );

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Settings" }]}>
      <PageHeader title="Settings" description="Organization, safeguards, notifications and account." />

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="safeguards">Release safeguards</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-3">
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
                        toast.error(error instanceof Error ? error.message : "Could not save the settings.");
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
        </TabsContent>

        <TabsContent value="safeguards" className="mt-3 space-y-3">
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
                      toast.error(error instanceof Error ? error.message : "Could not save.");
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
          {role === "owner" ? (
          <SectionCard title="Danger zone">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-[12px] font-medium">Delete organization</p>
                <p className="text-[11px] text-muted-foreground">
                  Removes every application, release record and API key. Bundles stay in your Firebase bucket.
                </p>
              </div>
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
                    toast.error(error instanceof Error ? error.message : "Could not delete the workspace.");
                  }
                }}
              />
            </div>
          </SectionCard>
          ) : null}
        </TabsContent>

        <TabsContent value="notifications" className="mt-3">
          <NotificationPreferences />
        </TabsContent>

        <TabsContent value="account" className="mt-3">
          <SectionCard title="Account security">
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
                    toast.error(error instanceof Error ? error.message : "Could not update the password.");
                  } finally {
                    setChangingPassword(false);
                  }
                }}
              >
                {changingPassword ? "Updating…" : "Update password"}
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="integrations" className="mt-3">
          <SectionCard title="Integrations">
            <ul className="divide-y divide-border">
              {[
                ["API keys", "Programmatic access for CI and scripts.", "/settings/api-keys"],
                ["CI/CD", "Publish releases from GitHub Actions, GitLab CI or Bitrise.", "/settings/ci-cd"],
                ["Webhooks", "Send release events to Slack, PagerDuty or your own endpoint.", "/settings/webhooks"],
              ].map(([label, description, to]) => (
                <li key={label} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="flex items-center gap-2 text-[12px] font-medium">
                      {label}
                      {label === "CI/CD"
                        ? (["github", "gitlab", "bitrise"] as const).map((tool) => (
                            <CiLogo key={tool} tool={tool} className="size-3.5" />
                          ))
                        : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
                    {label === "CI/CD" ? <Icons8Credit /> : null}
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" asChild>
                    <Link to={to as never}>Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
