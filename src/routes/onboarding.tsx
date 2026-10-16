import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/fireota/brand-mark";

import { CheckList, Field, WizardShell } from "@/components/fireota/wizard";
import { CopyButton, Label as TokenLabel } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import type { FirebaseProject } from "@/lib/types";
import { firebaseService, organizationService } from "@/services";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up FireOTA" },
      { name: "description", content: "Create your organization, connect Firebase and register your first React Native application." },
      { property: "og:title", content: "Set up FireOTA" },
      { property: "og:description", content: "Six short steps from account to first OTA release." },
    ],
  }),
  component: OnboardingPage,
});

const steps = ["Welcome", "Organization", "Connect Firebase", "Verify", "First app", "Done"];

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const session = useQuery(q.session());
  const joined = session.data?.organization ?? null;
  // An accepted invitation (or an existing workspace) skips onboarding.
  useEffect(() => {
    if (joined && step === 0) {
      toast.success(`You are a member of ${joined.name}.`);
      void navigate({ to: "/dashboard" });
    }
  }, [joined, step, navigate]);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [project, setProject] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifiedProject, setVerifiedProject] = useState<FirebaseProject | null>(null);
  const [appName, setAppName] = useState("");
  const [androidPackage, setAndroidPackage] = useState("");
  const [iosBundle, setIosBundle] = useState("");
  const [channel, setChannel] = useState("production");

  // Real Firebase projects from the authorized Google account.
  const selectable = useQuery({
    queryKey: ["firebase-selectable"],
    queryFn: () => firebaseService.listSelectable(),
    enabled: step === 2,
  });

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center gap-2">
          <BrandMark />
          <span className="font-display text-[18px] font-bold tracking-tight">FireOTA</span>
        </div>

        {step === 0 && (
          <WizardShell
            steps={steps}
            current={0}
            title="Let's set up FireOTA."
            description="Six short steps: create an organization, connect your Firebase project, verify access and register your first React Native application."
            footer={
              <>
                <span className="font-mono text-[10px] text-faint">Takes about three minutes</span>
                <Button size="sm" onClick={next}>
                  Get started
                </Button>
              </>
            }
          >
            <ul className="space-y-2 text-[12px] text-muted-foreground">
              <li>· Your OTA bundles and assets stay inside your own Firebase project.</li>
              <li>· FireOTA is free at the platform level — you keep your Firebase billing plan.</li>
              <li>· You can invite your team and connect CI after setup.</li>
            </ul>
          </WizardShell>
        )}

        {step === 1 && (
          <WizardShell
            steps={steps}
            current={1}
            title="Create your organization"
            description="Organizations own applications, Firebase connections, team members and audit history."
            footer={
              <>
                <Button variant="outline" size="sm" onClick={back}>
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={!orgName || !orgSlug}
                  onClick={async () => {
                    await organizationService.create(orgName, orgSlug);
                    next();
                  }}
                >
                  Continue
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization name" htmlFor="org-name">
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(event) => {
                    setOrgName(event.target.value);
                    setOrgSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                  }}
                  placeholder="Helio Labs"
                  className="h-9 text-[12px]"
                />
              </Field>
              <Field label="Slug" htmlFor="org-slug" hint="Used in URLs and CLI commands.">
                <Input
                  id="org-slug"
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(event.target.value)}
                  placeholder="helio-labs"
                  className="h-9 font-mono text-[12px]"
                />
              </Field>
            </div>
          </WizardShell>
        )}

        {step === 2 && (
          <WizardShell
            steps={steps}
            current={2}
            title="Connect Firebase"
            description="Your OTA files stay inside your Firebase project. FireOTA only stores metadata about releases."
            footer={
              <>
                <Button variant="outline" size="sm" onClick={back}>
                  Back
                </Button>
                <Button size="sm" disabled={!project} onClick={next}>
                  Connect Firebase
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label="Firebase project" hint="Choose the Firebase project that will store your OTA bundles.">
                <Select value={project} onValueChange={setProject}>
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue placeholder="Select a Firebase project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectable.data ?? []).map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.id} · {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="rounded-md border border-border bg-surface-2/40 p-3">
                <TokenLabel>Permissions requested</TokenLabel>
                <div className="mt-2">
                  <CheckList
                    items={[
                      { label: "Project access", granted: true },
                      { label: "Storage access", granted: true },
                      { label: "Firestore access", granted: true },
                      { label: "Firebase application metadata", granted: true },
                      { label: "Analytics", granted: false, optional: true },
                      { label: "Crashlytics", granted: false, optional: true },
                    ]}
                  />
                </div>
              </div>
            </div>
          </WizardShell>
        )}

        {step === 3 && (
          <WizardShell
            steps={steps}
            current={3}
            title="Verify Firebase access"
            description="We check that FireOTA can write bundles to Storage and record release metadata in Firestore."
            footer={
              <>
                <Button variant="outline" size="sm" onClick={back}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={verifying}
                    onClick={async () => {
                      setVerifying(true);
                      try {
                        const result = await firebaseService.verify(project);
                        setVerifiedProject(result);
                        setVerified(result.status === "connected");
                        if (result.status !== "connected") {
                          toast.warning("FireOTA cannot write to this project's Storage yet. Set up Storage or fix permissions, then retry.");
                        }
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Verification failed.");
                      } finally {
                        setVerifying(false);
                      }
                    }}
                  >
                    {verifying ? "Verifying…" : "Run verification"}
                  </Button>
                  <Button size="sm" disabled={!verified} onClick={next}>
                    Continue
                  </Button>
                </div>
              </>
            }
          >
            <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
              {[
                ["Project name", verifiedProject?.name ?? "—"],
                ["Project ID", verifiedProject?.firebaseId ?? (project || "—")],
                ["Storage", verifiedProject ? (verifiedProject.storage === "enabled" ? `writable (${verifiedProject.storageBucket})` : "not writable") : "not checked"],
                ["Firestore", verifiedProject?.firestore ?? "not checked"],
                ["Permissions", verifiedProject ? (verifiedProject.permissions.every((p) => p.granted || p.optional) ? "granted" : "missing") : "not checked"],
                ["Connection", verifiedProject?.status ?? (verifying ? "verifying" : "not verified")],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
                  <dd className={verified ? "text-success" : "text-muted-foreground"}>{value}</dd>
                </div>
              ))}
            </dl>
          </WizardShell>
        )}

        {step === 4 && (
          <WizardShell
            steps={steps}
            current={4}
            title="Register your first React Native app"
            description="Platform identifiers let FireOTA match update requests from your app to the right release."
            footer={
              <>
                <Button variant="outline" size="sm" onClick={back}>
                  Back
                </Button>
                <Button size="sm" disabled={!appName} onClick={next}>
                  Create application
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="App name" htmlFor="app-name">
                <Input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Ledger" className="h-9 text-[12px]" />
              </Field>
              <Field label="Default channel" htmlFor="app-channel">
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger id="app-channel" className="h-9 text-[12px]">
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
              <Field label="Android package" htmlFor="android-package" hint="Leave empty if you don't ship Android.">
                <Input
                  id="android-package"
                  value={androidPackage}
                  onChange={(e) => setAndroidPackage(e.target.value)}
                  placeholder="dev.helio.ledger"
                  className="h-9 font-mono text-[12px]"
                />
              </Field>
              <Field label="iOS bundle identifier" htmlFor="ios-bundle" hint="Leave empty if you don't ship iOS.">
                <Input
                  id="ios-bundle"
                  value={iosBundle}
                  onChange={(e) => setIosBundle(e.target.value)}
                  placeholder="dev.helio.ledger"
                  className="h-9 font-mono text-[12px]"
                />
              </Field>
            </div>
          </WizardShell>
        )}

        {step === 5 && (
          <WizardShell
            steps={steps}
            current={5}
            title="Your FireOTA workspace is ready."
            description="Next: install the SDK in your React Native app, then upload your first bundle."
            footer={
              <>
                <Button variant="outline" size="sm" onClick={back}>
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    toast.success("Workspace ready. Welcome to FireOTA.");
                    void navigate({ to: "/dashboard" });
                  }}
                >
                  Open Dashboard
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">npm i @fireota/react-native</span>
                  <CopyButton value="npm i @fireota/react-native" />
                </div>
              </div>
              <CheckList
                items={[
                  { label: "Organization created", granted: true },
                  { label: "Firebase connected and verified", granted: true },
                  { label: `Application registered${appName ? `: ${appName}` : ""}`, granted: Boolean(appName) },
                  { label: "First OTA release published", granted: false },
                ]}
              />
            </div>
          </WizardShell>
        )}
      </div>
    </div>
  );
}
