import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonRows,
} from "@/components/fireota/primitives";
import { CiPipelinePicker, type Options } from "@/components/fireota/ci-pipelines";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { q } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/ci-cd")({
  head: () => ({
    meta: [
      { title: "CI/CD — FireOTA" },
      {
        name: "description",
        content:
          "Publish OTA updates from GitHub Actions, GitLab CI, Bitbucket Pipelines, Jenkins, Azure DevOps, CircleCI, Bitrise or any CI with the FireOTA CLI.",
      },
      { property: "og:title", content: "CI/CD — FireOTA" },
      { property: "og:description", content: "Ship OTA updates straight from any pipeline." },
    ],
  }),
  component: CiCdPage,
});


function CiCdPage() {
  const deployments = useQuery(q.deployments());
  const apps = useQuery(q.apps());
  const [appId, setAppId] = useState("");
  const [channel, setChannel] = useState("production");
  const [platform, setPlatform] = useState("all");
  const [rollout, setRollout] = useState("10");

  const app = (apps.data ?? []).find((a) => a.id === appId) ?? apps.data?.[0];
  const options: Options = {
    appId: app?.id ?? "YOUR_APP_ID",
    channel,
    platform,
    rollout: Math.max(0, Math.min(100, Number(rollout) || 0)),
    runtime: app?.runtimeVersion ?? "1.0.0",
    signed: Boolean(app?.codeSigning?.keyId),
    url: typeof window !== "undefined" ? window.location.origin : "https://your-fireota-domain",
  };

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Settings", to: "/settings" },
        { label: "CI/CD" },
      ]}
    >
      <PageHeader
        title="CI/CD"
        description="One CLI command works in every pipeline. Commit, branch and build number are detected automatically on all major CI tools."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/api-keys">Create API key</Link>
          </Button>
        }
      />

      <SectionCard title="1 · Pipeline settings">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Application">
            <Select value={app?.id ?? ""} onValueChange={setAppId}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue placeholder="Choose an application" />
              </SelectTrigger>
              <SelectContent>
                {(apps.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 font-mono text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(app?.channels ?? ["production"]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Platform">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Android + iOS (one update group)</SelectItem>
                <SelectItem value="android">Android</SelectItem>
                <SelectItem value="ios">iOS (macOS runner)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start rollout at (%)">
            <Input
              value={rollout}
              onChange={(e) => setRollout(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-9 font-mono text-[12px]"
            />
          </Field>
        </div>
        <p className="px-4 pb-4 text-[11px] text-muted-foreground">
          Runtime <span className="font-mono">{options.runtime}</span> comes from the app — bump it
          (and the app's store build) whenever native code changes.
          {options.signed
            ? " This app has code signing on, so the snippets include the signing key secret."
            : ""}
        </p>
      </SectionCard>

      <SectionCard title="2 · Add the secrets to your CI">
        <ul className="divide-y divide-border text-[12px]">
          <li className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
            <code className="w-56 font-mono">FIREOTA_API_KEY</code>
            <span className="text-muted-foreground">
              An API key with release.write + release.publish scopes (admins create it under API
              keys).
            </span>
          </li>
          {options.signed ? (
            <li className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
              <code className="w-56 font-mono">FIREOTA_SIGNING_KEY</code>
              <span className="text-muted-foreground">
                Contents of <code className="font-mono">fireota-private.pem</code> (or{" "}
                <code className="font-mono">FIREOTA_SIGNING_KEY_PATH</code> to a secret file). Never
                commit it.
              </span>
            </li>
          ) : null}
          <li className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
            <code className="w-56 font-mono">FIREOTA_URL</code>
            <span className="text-muted-foreground">
              <span className="font-mono">{options.url}</span> (not secret).
            </span>
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="3 · Add the pipeline step">
        <div className="p-4">
          <CiPipelinePicker options={options} />
          <p className="mt-3 text-[11px] text-muted-foreground">
            The CLI exits with code 1 on any error, retries safely (the same commit never creates a
            duplicate update), and <span className="font-mono">--json</span> prints a
            machine-readable result for later steps. Verify a key with{" "}
            <span className="font-mono">npx @fireota/cli whoami</span>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Recent pipeline deployments">
        {deployments.isLoading ? (
          <SkeletonRows rows={3} cols={4} />
        ) : (deployments.data ?? []).length === 0 ? (
          <EmptyState title="No pipeline deployments recorded yet." compact />
        ) : (
          <ul className="divide-y divide-border">
            {(deployments.data ?? []).map((deployment) => (
              <li
                key={deployment.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-[12px]"
              >
                <span className="font-medium">{deployment.provider}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {deployment.repo}
                </span>
                <span className="font-mono text-[11px]">{deployment.release}</span>
                <span
                  className={`font-mono text-[10px] ${
                    deployment.status === "success"
                      ? "text-success"
                      : deployment.status === "running"
                        ? "text-warning"
                        : "text-danger"
                  }`}
                >
                  {deployment.status.toUpperCase()}
                </span>
                <span className="ml-auto font-mono text-[10px] text-faint">{deployment.at}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </AppShell>
  );
}
