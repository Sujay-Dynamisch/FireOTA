import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { PageHeader, SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { q } from "@/lib/queries";
import { authService, organizationService } from "@/services";

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

function SettingsPage() {
  const organization = useQuery(q.session());
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoRollback, setAutoRollback] = useState(true);
  const [notifyFailures, setNotifyFailures] = useState(true);
  const [notifyPublishes, setNotifyPublishes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const org = organization.data?.organization ?? null;

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
                  <Field label="Slug" hint="Used in API paths and CLI output.">
                    <Input value={org.slug} readOnly className="h-9 font-mono text-[12px] text-muted-foreground" />
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
                  <Field label="Default channel" hint="Pre-selected when creating a release.">
                    <Input value={org.defaultChannel} readOnly className="h-9 font-mono text-[12px] text-muted-foreground" />
                  </Field>
                </div>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await organizationService.update({ name: name || org.name, timezone: timezone || org.timezone });
                      toast.success("Organization settings saved.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
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
                  checked={requireApproval}
                  onCheckedChange={setRequireApproval}
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
                requireTyped="DELETE"
                requireReason
                details={[{ label: "Organization", value: org?.name ?? "—" }]}
                onConfirm={() => {
                  toast.error("Deleting an organization is disabled in this environment.");
                }}
              />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="notifications" className="mt-3">
          <SectionCard title="Notification preferences">
            <ul className="divide-y divide-border">
              <li className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-[12px] font-medium">Failure and rollback alerts</p>
                  <p className="text-[11px] text-muted-foreground">Email and in-app alerts when a rollout degrades.</p>
                </div>
                <Switch checked={notifyFailures} onCheckedChange={setNotifyFailures} aria-label="Failure alerts" />
              </li>
              <li className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-[12px] font-medium">Every publish</p>
                  <p className="text-[11px] text-muted-foreground">Notify me whenever any teammate publishes a release.</p>
                </div>
                <Switch checked={notifyPublishes} onCheckedChange={setNotifyPublishes} aria-label="Publish notifications" />
              </li>
            </ul>
          </SectionCard>
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
                    <p className="text-[12px] font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
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
