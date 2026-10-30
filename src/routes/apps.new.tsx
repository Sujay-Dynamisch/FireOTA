import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Field, WizardShell } from "@/components/fireota/wizard";
import { HelpHint, PageHeader } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import { appsService } from "@/services";

export const Route = createFileRoute("/apps/new")({
  head: () => ({
    meta: [
      { title: "Add application — FireOTA" },
      { name: "description", content: "Register a React Native application, choose platforms and configure its runtime and channels." },
      { property: "og:title", content: "Add application — FireOTA" },
      { property: "og:description", content: "Register a React Native application for OTA releases." },
    ],
  }),
  component: NewAppPage,
});

const steps = ["Details", "Storage target", "Platforms", "Runtime", "Channels", "Review"];

function NewAppPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [project, setProject] = useState("");
  const [android, setAndroid] = useState(true);
  const [ios, setIos] = useState(true);
  const [androidPackage, setAndroidPackage] = useState("");
  const [iosBundle, setIosBundle] = useState("");
  const [runtime, setRuntime] = useState("1.0.0");
  const [channels, setChannels] = useState<string[]>(["production", "beta"]);
  const [defaultChannel, setDefaultChannel] = useState("production");
  const projects = useQuery(q.projects());
  const storageTargets = useQuery(q.storageTargets());
  const [pending, setPending] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Applications", to: "/apps" },
        { label: "New application" },
      ]}
    >
      <PageHeader title="Add application" description="Register a React Native application for OTA releases." />

      {step === 0 && (
        <WizardShell
          steps={steps}
          current={0}
          title="Application details"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/apps" })}>
                Cancel
              </Button>
              <Button size="sm" disabled={!name || !slug} onClick={next}>
                Continue
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application name" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }}
                className="h-9 text-[12px]"
                placeholder="Ledger"
              />
            </Field>
            <Field label="Slug" htmlFor="slug" hint="Used by the CLI and API.">
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 font-mono text-[12px]" />
            </Field>
          </div>
        </WizardShell>
      )}

      {step === 1 && (
        <WizardShell
          steps={steps}
          current={1}
          title="Storage target"
          description="Bundles and assets for this application will be stored in your own cloud bucket."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
              <Button size="sm" onClick={next}>
                Continue
              </Button>
            </>
          }
        >
          <Field label="Destination storage target" hint="Pick which connected cloud bucket will store this app's releases">
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="h-9 max-w-sm text-[12px]">
                <SelectValue placeholder="Select storage target" />
              </SelectTrigger>
              <SelectContent>
                {(storageTargets.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.provider.toUpperCase()}{t.bucket ? ` · ${t.bucket}` : ""})
                  </SelectItem>
                ))}
                {(projects.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} (Firebase · {option.storageBucket})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="mt-3">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" asChild>
              <Link to="/projects/connect">+ Connect New Storage (R2, S3, MinIO, GCS, Azure)</Link>
            </Button>
          </div>
        </WizardShell>
      )}

      {step === 2 && (
        <WizardShell
          steps={steps}
          current={2}
          title="Platforms"
          description="Platform identifiers must match the values in your native project."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
              <Button size="sm" disabled={(android && !androidPackage) || (ios && !iosBundle)} onClick={next}>
                Continue
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[12px]">
              <Checkbox checked={android} onCheckedChange={(c) => setAndroid(c === true)} /> Android
            </label>
            {android ? (
              <Field label="Android package name" htmlFor="android-package">
                <Input
                  id="android-package"
                  value={androidPackage}
                  onChange={(e) => setAndroidPackage(e.target.value)}
                  className="h-9 max-w-sm font-mono text-[12px]"
                  placeholder="dev.helio.ledger"
                />
              </Field>
            ) : null}
            <label className="flex items-center gap-2 text-[12px]">
              <Checkbox checked={ios} onCheckedChange={(c) => setIos(c === true)} /> iOS
            </label>
            {ios ? (
              <Field label="iOS bundle identifier" htmlFor="ios-bundle">
                <Input
                  id="ios-bundle"
                  value={iosBundle}
                  onChange={(e) => setIosBundle(e.target.value)}
                  className="h-9 max-w-sm font-mono text-[12px]"
                  placeholder="dev.helio.ledger"
                />
              </Field>
            ) : null}
          </div>
        </WizardShell>
      )}

      {step === 3 && (
        <WizardShell
          steps={steps}
          current={3}
          title="Runtime configuration"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
              <Button size="sm" onClick={next}>
                Continue
              </Button>
            </>
          }
        >
          <Field
            label="Runtime version"
            htmlFor="runtime"
            aside={
              <HelpHint>
                The runtime version pins a JavaScript bundle to a compatible native binary. A device only receives a
                release whose runtime matches the app build installed on it.
              </HelpHint>
            }
            hint="Bump this whenever native dependencies change."
          >
            <Input id="runtime" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="h-9 max-w-40 font-mono text-[12px]" />
          </Field>
        </WizardShell>
      )}

      {step === 4 && (
        <WizardShell
          steps={steps}
          current={4}
          title="Channels"
          description="Channels decide which devices receive which release. Production is always treated as a protected environment."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
              <Button size="sm" disabled={channels.length === 0} onClick={next}>
                Continue
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {["production", "beta", "staging", "development"].map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-[12px]">
                <Checkbox
                  checked={channels.includes(channel)}
                  onCheckedChange={(checked) =>
                    setChannels((prev) => (checked ? [...prev, channel] : prev.filter((c) => c !== channel)))
                  }
                />
                <span className="font-mono">{channel}</span>
              </label>
            ))}
            <Field label="Default channel">
              <Select value={defaultChannel} onValueChange={setDefaultChannel}>
                <SelectTrigger className="h-9 max-w-40 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {channel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </WizardShell>
      )}

      {step === 5 && (
        <WizardShell
          steps={steps}
          current={5}
          title="Review"
          description="Confirm the configuration before the application is created."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    await appsService.create({
                      name,
                      slug,
                      runtimeVersion: runtime,
                      ...(project ? { storageTargetId: project, firebaseProjectId: project } : {}),
                      platforms: [
                        ...(android
                          ? [{ platform: "android" as const, packageName: androidPackage, nativeVersion: runtime }]
                          : []),
                        ...(ios ? [{ platform: "ios" as const, bundleIdentifier: iosBundle, nativeVersion: runtime }] : []),
                      ],
                    });
                    toast.success(`${name} created. Upload your first bundle to publish a release.`);
                    void navigate({ to: "/apps" });
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Creating…" : "Create application"}
              </Button>
            </>
          }
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            {[
              ["Name", name],
              ["Slug", slug],
              ["Firebase project", project.replace("fb_", "")],
              ["Android package", android ? androidPackage : "not shipped"],
              ["iOS bundle", ios ? iosBundle : "not shipped"],
              ["Runtime version", runtime],
              ["Channels", channels.join(", ")],
              ["Default channel", defaultChannel],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
                <dd className="text-[12px]">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </WizardShell>
      )}
    </AppShell>
  );
}
