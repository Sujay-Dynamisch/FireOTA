import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Home, Loader2, LogOut, ShieldCheck, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/fireota/brand-mark";
import { BackgroundGlow, SettingUpScreen } from "@/components/fireota/setting-up-screen";

import { CheckList, Field, WizardShell } from "@/components/fireota/wizard";
import { CopyButton, Label as TokenLabel } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import type { FirebaseProject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { authService, firebaseService, organizationService } from "@/services";

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
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
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
    retry: false,
  });

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // Returning users already have a workspace (and Firebase): show a loader while we check and
  // redirect, instead of flashing the setup wizard.
  if (session.isPending || (joined && step === 0)) return <SettingUpScreen workspace={joined?.name} />;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundGlow />
      {/* Way out of onboarding: back to the website, or sign out to use another account. */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {session.data?.user?.email ? (
          <span className="hidden max-w-[220px] truncate rounded-full border border-border bg-background/80 px-3 py-1 text-[12px] text-muted-foreground backdrop-blur sm:inline">
            {session.data.user.email}
          </span>
        ) : null}
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link to="/">
            <Home className="size-4" aria-hidden /> Home
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 bg-background/80 backdrop-blur"
          loading={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await authService.signOut();
              queryClient.clear();
              void navigate({ to: "/login" });
            } catch (error) {
              setSigningOut(false);
              toast.error(friendlyError(error, "Could not sign out. Try again."));
            }
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </div>
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-10">
        <aside className="hidden lg:block">
          <div className="flex items-center gap-2">
            <BrandMark className="size-9" />
            <span className="font-display text-[20px] font-bold tracking-tight">FireOTA</span>
          </div>
          <h1 className="mt-8 font-display text-[34px] font-bold leading-[1.15] tracking-tight">
            Ship React Native updates from <span className="text-brand">your own Firebase</span>.
          </h1>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Over-the-air updates with staged rollouts and instant rollback. Your bundles never leave your Google Firebase project.
          </p>
          <PoweredByFirebase className="mt-8" />
          <ul className="mt-8 space-y-4">
            {[
              { icon: ShieldCheck, title: "Your data stays yours", text: "Bundles live in your Firebase Storage. FireOTA stores only release details." },
              { icon: Zap, title: "Ship in minutes", text: "Publish from the CLI or CI, roll out to 10%, then everyone." },
              { icon: Users, title: "Built for teams", text: "Invite teammates, set roles and keep an audit trail." },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{title}</span>
                  <span className="block text-[12px] text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex items-center gap-2 lg:hidden">
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
                <Button size="sm" disabled={!project} loading={selectable.isPending} onClick={next}>
                  Connect Firebase
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-[#ffca28]/40 bg-gradient-to-r from-[#FFF8E1] to-transparent p-3.5 dark:from-[#ffca28]/10">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background shadow-sm">
                  <img src="/brand/eco/firebase.svg" alt="Google Firebase" width={28} height={28} className="size-7" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">Google Firebase</span>
                  <span className="block text-[12px] text-muted-foreground">
                    Choose the project from your Google account that will store your update bundles.
                  </span>
                </span>
              </div>
              {selectable.isPending && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/40 px-3 py-2.5 text-[12px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Connecting to Google… loading your Firebase projects
                </div>
              )}
              {selectable.isError && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[12px]">
                  <span>{selectable.error instanceof Error ? selectable.error.message : "Could not load Firebase projects."}</span>
                  <Button variant="outline" size="sm" onClick={() => selectable.refetch()}>
                    Retry
                  </Button>
                </div>
              )}
              <Field label="Firebase project" hint="Choose the Firebase project that will store your OTA bundles.">
                <Select value={project} onValueChange={setProject} disabled={selectable.isPending}>
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue placeholder={selectable.isPending ? "Loading Firebase projects…" : "Select a Firebase project"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectable.data ?? []).map((option) => (
                      <SelectItem key={option.id} value={option.id} disabled={option.connected}>
                        {option.id} · {option.name}
                        {option.connected ? " · already connected" : ""}
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
            description="We check that FireOTA can write update bundles to your Firebase Storage bucket."
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
                        toast.error(friendlyError(error, "Verification failed."));
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
        <PoweredByFirebase className="mt-6 lg:hidden" />
        </div>
      </div>
    </div>
  );
}

/** Shows that storage and metadata run on the customer's own Google Firebase project. */
function PoweredByFirebase({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-border bg-background/80 p-3.5 shadow-sm backdrop-blur", className)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FFF8E1] dark:bg-[#ffca28]/10">
        <img src="/brand/eco/firebase.svg" alt="Google Firebase" width={28} height={28} className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-faint">Powered by</span>
        <span className="block text-[14px] font-semibold">Google Firebase</span>
        <span className="block truncate text-[11px] text-muted-foreground">Cloud Storage for Firebase</span>
      </span>
      <img src="/brand/eco/google-cloud.svg" alt="Google Cloud" width={24} height={24} className="size-6 opacity-90" />
    </div>
  );
}
