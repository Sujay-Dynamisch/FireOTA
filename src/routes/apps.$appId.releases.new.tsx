import { friendlyError } from "@/lib/friendly-error";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { EnvBadge, HelpHint, PageHeader, RolloutBar } from "@/components/fireota/primitives";
import { Field, WizardShell } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isValidVersion } from "@/lib/backend/versions";
import { q } from "@/lib/queries";
import { releasesService } from "@/services";

export const Route = createFileRoute("/apps/$appId/releases/new")({
  head: () => ({
    meta: [
      { title: "Create release — FireOTA" },
      {
        name: "description",
        content: "Upload a JavaScript bundle, pick a channel and runtime, then publish a staged OTA release.",
      },
      { property: "og:title", content: "Create release — FireOTA" },
      { property: "og:description", content: "Upload a bundle and publish a staged OTA release." },
    ],
  }),
  component: NewReleasePage,
});

const steps = ["Upload", "Target", "Metadata", "Rollout", "Review"];

function NewReleasePage() {
  const { appId } = useParams({ from: "/apps/$appId/releases/new" });
  const navigate = useNavigate();
  const app = useQuery(q.app(appId));
  const channels = useQuery(q.channels(appId));

  const bundleInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [bundle, setBundle] = useState<File | null>(null);
  const [upload, setUpload] = useState<{ stage: string; percent: number } | null>(null);
  const [uploaded, setUploaded] = useState<{ checksum: string; size: string } | null>(null);
  const [platform, setPlatform] = useState("android");
  const [channel, setChannel] = useState("beta");
  const [version, setVersion] = useState("");
  const [runtime, setRuntime] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [rollout, setRollout] = useState(10);
  const [pending, setPending] = useState(false);

  // Same rule as the server (isValidVersion): 1.4 or 1.4.2, optional v prefix and -tag.
  const versionProblem = (value: string, label: string) =>
    !value || isValidVersion(value) ? null : `${label} must look like 1.4.2 (or 1.4, 1.4.2-beta.1).`;
  // The version is only an optional label: updates are identified by their ID (Expo-style).
  const versionError = version && !/^[\w.+-]{1,40}$/.test(version) ? "Use letters, digits, dots, dashes or +." : null;
  const runtimeError = versionProblem(runtime, "Runtime version");
  const appPlatforms = app.data?.platforms ?? [];

  // Pre-fill what the app already knows: its runtime and its only platform.
  useEffect(() => {
    if (app.data?.runtimeVersion && !runtime) setRuntime(app.data.runtimeVersion);
    if (appPlatforms.length > 0 && !appPlatforms.includes(platform as never)) setPlatform(appPlatforms[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.data]);

  const environment = channel === "production" ? "production" : channel === "staging" ? "staging" : channel === "beta" ? "beta" : "development";

  const startUpload = async (file: File) => {
    setBundle(file);
    setUploaded(null);
    setUpload({ stage: "Uploading bundle", percent: 0 });
    try {
      const result = await releasesService.upload({ bundle: file }, (stage, percent) => setUpload({ stage, percent }));
      setUploaded(result);
      setUpload(null);
      toast.success("Bundle uploaded and verified.");
    } catch (error) {
      setBundle(null);
      setUpload(null);
      toast.error(friendlyError(error, "Upload failed. Check your connection and try again."));
    }
  };

  const publish = async () => {
    setPending(true);
    try {
      const created = await releasesService.create({
        appId,
        platform: platform as "android" | "ios",
        channel,
        ...(version ? { version } : {}),
        runtimeVersion: runtime,
        notes,
        mandatory,
        rollout,
      });
      toast.success(`Update #${created.number} published to ${channel} at ${rollout}%.`);
      void navigate({ to: "/releases" });
    } catch (error) {
      // Show the server's reason (validation, permissions, Firebase Storage) instead of a generic line.
      toast.error(`The release could not be published. ${friendlyError(error, "Please try again.")}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Applications", to: "/apps" },
        { label: app.data?.name ?? "Application", to: "/apps" },
        { label: "New release" },
      ]}
    >
      <PageHeader
        title="Create release"
        description={app.data ? `Publish a new OTA update for ${app.data.name}.` : "Publish a new OTA update."}
      />

      {step === 0 && (
        <WizardShell
          steps={steps}
          current={0}
          title="Upload JavaScript bundle"
          description="Bundles are uploaded directly to your Firebase Storage bucket."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/apps" })}>
                Cancel
              </Button>
              <Button size="sm" disabled={!uploaded} onClick={() => setStep(1)}>
                Continue
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <input
              ref={bundleInput}
              type="file"
              className="sr-only"
              aria-label="JavaScript bundle file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void startUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => bundleInput.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-brand/40 hover:bg-brand/[0.03]"
            >
              <UploadCloud aria-hidden className="size-5 text-muted-foreground" />
              <span className="text-[12px] font-medium">
                {bundle ? bundle.name : "Select or drop your update package (.fota, built with npx fireota bundle)"}
              </span>
              <span className="font-mono text-[10px] text-faint">max 40 MB</span>
            </button>

            {upload ? (
              <div className="rounded-md border border-border bg-surface-2/40 p-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span>{upload.stage}</span>
                  <span className="font-mono text-[11px]">{upload.percent}%</span>
                </div>
                <RolloutBar value={upload.percent} showValue={false} className="mt-2" />
              </div>
            ) : null}

            {uploaded ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Compressed size</dt>
                  <dd className="font-mono text-[12px]">{uploaded.size}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Checksum</dt>
                  <dd className="truncate font-mono text-[11px] text-muted-foreground">{uploaded.checksum}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </WizardShell>
      )}

      {step === 1 && (
        <WizardShell
          steps={steps}
          current={1}
          title="Target platform and channel"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button size="sm" onClick={() => setStep(2)}>
                Continue
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(appPlatforms.length > 0 ? appPlatforms : ["android", "ios"]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p === "ios" ? "iOS" : "Android"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Channel" hint="Production releases require an extra confirmation before publishing.">
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(channels.data ?? []).length > 0
                    ? (channels.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))
                    : ["production", "beta", "staging"].map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <EnvBadge environment={environment as never} />
            <span className="font-mono text-[10px] text-faint">
              {environment === "production" ? "protected environment" : "safe to iterate"}
            </span>
          </div>
        </WizardShell>
      )}

      {step === 2 && (
        <WizardShell
          steps={steps}
          current={2}
          title="Release metadata"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button size="sm" disabled={!notes.trim() || !runtime || Boolean(versionError) || Boolean(runtimeError)} onClick={() => setStep(3)}>
                Continue
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Version label (optional)"
                htmlFor="version"
                hint="Updates get their own ID automatically. Add a label only if it helps your team, e.g. 1.3.1-hotfix."
              >
                <Input
                  id="version"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  placeholder="optional"
                  aria-invalid={Boolean(versionError)}
                  className="h-9 font-mono text-[12px]"
                />
                {versionError ? <p className="font-mono text-[10px] text-danger">{versionError}</p> : null}
              </Field>
              <Field
                label="Runtime version"
                htmlFor="runtime-version"
                aside={
                  <HelpHint>
                    The runtime version of the store build this update is for. Only phones running that exact build receive it.
                  </HelpHint>
                }
              >
                <Input
                  id="runtime-version"
                  value={runtime}
                  onChange={(event) => setRuntime(event.target.value)}
                  placeholder={app.data?.runtimeVersion ?? "1.0.0"}
                  aria-invalid={Boolean(runtimeError)}
                  className="h-9 font-mono text-[12px]"
                />
                {runtimeError ? <p className="font-mono text-[10px] text-danger">{runtimeError}</p> : null}
              </Field>
            </div>
            <Field label="Message" htmlFor="notes" hint="Describe what changed — like a commit message. Shown in the dashboard and the SDK.">
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Fix the Send money button label."
                className="text-[12px]"
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-2/40 px-3 py-2.5">
              <div>
                <p className="text-[12px] font-medium">Mandatory update</p>
                <p className="text-[11px] text-muted-foreground">
                  Blocks app usage until the update is installed. Use sparingly.
                </p>
              </div>
              <Switch checked={mandatory} onCheckedChange={setMandatory} aria-label="Mandatory update" />
            </div>
          </div>
        </WizardShell>
      )}

      {step === 3 && (
        <WizardShell
          steps={steps}
          current={3}
          title="Staged rollout"
          description="Start small on production. You can raise the percentage at any time from the release page."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button size="sm" onClick={() => setStep(4)}>
                Continue
              </Button>
            </>
          }
        >
          <div className="max-w-xl space-y-4">
            <div className="flex items-center justify-between text-[12px]">
              <span>Initial rollout</span>
              <span className="font-mono">{rollout}%</span>
            </div>
            <Slider
              aria-label="Initial rollout percentage"
              value={[rollout]}
              onValueChange={(value) => setRollout(value[0] ?? 0)}
              min={0}
              max={100}
              step={1}
            />
            <div className="flex flex-wrap gap-1.5">
              {[1, 5, 10, 25, 50, 100].map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  className="h-7 font-mono text-[11px]"
                  onClick={() => setRollout(preset)}
                >
                  {preset}%
                </Button>
              ))}
            </div>
          </div>
        </WizardShell>
      )}

      {step === 4 && (
        <WizardShell
          steps={steps}
          current={4}
          title="Review and publish"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(3)}>
                Back
              </Button>
              {environment === "production" ? (
                <ConfirmAction
                  trigger={
                    <Button size="sm" disabled={pending}>
                      {pending ? "Publishing…" : "Publish to production"}
                    </Button>
                  }
                  title="Publish to production"
                  description="This release becomes available to production devices as soon as it is published."
                  warning={`${rollout}% of eligible production devices will receive it on their next update check.`}
                  confirmLabel="Publish release"
                  destructive={rollout > 25}
                  requireTyped="PUBLISH"
                  details={[
                    { label: "Application", value: app.data?.name ?? appId },
                    { label: "Version label", value: version || "—" },
                    { label: "Channel", value: channel },
                    { label: "Initial rollout", value: `${rollout}%` },
                    { label: "Mandatory", value: mandatory ? "Yes" : "No" },
                  ]}
                  onConfirm={publish}
                />
              ) : (
                <Button size="sm" disabled={pending} onClick={() => void publish()}>
                  {pending ? "Publishing…" : "Publish release"}
                </Button>
              )}
            </>
          }
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            {[
              ["Application", app.data?.name ?? appId],
              ["Platform", platform],
              ["Channel", channel],
              ["Version label", version || "—"],
              ["Runtime version", runtime],
              ["Bundle size", uploaded?.size ?? "—"],
              ["Initial rollout", `${rollout}%`],
              ["Mandatory", mandatory ? "Yes" : "No"],
              ["Message", notes || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
                <dd className="text-[12px]">{value}</dd>
              </div>
            ))}
          </dl>
        </WizardShell>
      )}
    </AppShell>
  );
}
