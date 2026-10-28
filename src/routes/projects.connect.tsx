import { friendlyError } from "@/lib/friendly-error";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { HelpHint, PageHeader, SkeletonRows } from "@/components/fireota/primitives";
import { CheckList, Field, WizardShell } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { FirebaseProject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { firebaseService } from "@/services";

export const Route = createFileRoute("/projects/connect")({
  head: () => ({
    meta: [
      { title: "Connect Firebase — FireOTA" },
      {
        name: "description",
        content: "Grant FireOTA access to your Firebase project, pick a bucket and verify the connection.",
      },
      { property: "og:title", content: "Connect Firebase — FireOTA" },
      { property: "og:description", content: "Connect your own Firebase project in three steps." },
    ],
  }),
  component: ConnectProjectPage,
});

const steps = ["Google account", "Select project", "Verify"];

function ConnectProjectPage() {
  const navigate = useNavigate();
  // Google redirects back here with ?status=connected|denied|expired|failed|invalid.
  const [step, setStep] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("status") === "connected" ? 1 : 0,
  );
  const [authorizing, setAuthorizing] = useState(false);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    const messages: Record<string, string> = {
      denied: "Google access was not granted. Nothing was connected.",
      expired: "The Google sign-in expired. Please try again.",
      failed: "Google sign-in failed. Please try again.",
      invalid: "The Google sign-in response was invalid. Please try again.",
    };
    // Fixed toast id so a double-run effect cannot stack duplicates.
    if (status === "connected") toast.success("Google account authorized. Choose a Firebase project.", { id: "google-oauth" });
    else if (status && messages[status]) toast.error(messages[status], { id: "google-oauth" });
    // Drop ?status so a refresh or remount does not report the same result again.
    if (status) {
      const url = new URL(window.location.href);
      url.searchParams.delete("status");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);
  const [selected, setSelected] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [result, setResult] = useState<FirebaseProject | null>(null);
  // Each line reflects the real verification result (null = not checked yet).
  const writable = result ? result.storage === "enabled" : null;
  const writeFailure = result?.permissions.find((p) => p.label === "Cloud Storage read/write")?.reason;
  const checks = [
    {
      // Only the bucket's name from the project settings; the write test below is what proves access.
      label: "Storage bucket found",
      ok: result ? Boolean(result.storageBucket) : null,
      fix: "No Storage bucket found. Open Storage in the Firebase console and click Get started.",
    },
    {
      label: "Write test object",
      ok: writable,
      fix:
        writeFailure === "billing"
          ? "Billing is disabled on this Google Cloud project, so Google refuses Storage writes. Re-enable billing, then verify again."
          : writeFailure === "permission"
            ? "The connected Google account can't write to this bucket. Give it the Storage Admin (or Editor) role on the project."
            : writeFailure === "bucket_missing"
              ? "The Storage bucket doesn't exist yet. Open Storage in the Firebase console and click Get started."
              : writeFailure === "auth_expired"
                ? "The Google authorization expired. Go back and choose Continue with Google again."
                : "FireOTA couldn't write to the bucket. Check that billing is enabled and the connected Google account can edit Storage.",
    },
    {
      label: "Read test object back",
      ok: writable,
      fix: "The test file couldn't be read back, because the write above failed.",
    },
  ];

  const selectable = useQuery({
    queryKey: ["firebase-selectable"],
    queryFn: () => firebaseService.listSelectable(),
    enabled: step >= 1,
    retry: false,
  });

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Projects", to: "/projects" },
        { label: "Connect" },
      ]}
    >
      <PageHeader title="Connect Firebase" description="FireOTA never stores your bundles — your project does." />

      {step === 0 && (
        <WizardShell
          steps={steps}
          current={0}
          title="Authorize a Google account"
          description="Google will ask you to approve these permissions. FireOTA only uses them when you connect, verify or publish."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/projects" })}>
                Cancel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Use connected account
              </Button>
              <Button
                size="sm"
                disabled={authorizing}
                onClick={async () => {
                  // Always go through Google's consent screen, so a different account can be connected.
                  setAuthorizing(true);
                  try {
                    await firebaseService.reconnect();
                  } catch (error) {
                    setAuthorizing(false);
                    toast.error(friendlyError(error, "Could not start Google sign-in."));
                  }
                }}
              >
                {authorizing ? "Opening Google…" : "Continue with Google"}
              </Button>
            </>
          }
        >
          <div className="max-w-lg space-y-3">
            <CheckList
              items={[
                { label: "List your Firebase projects and read their Storage bucket name", granted: true },
                { label: "Upload, verify and delete update packages in the selected bucket (fireota/ folder only)", granted: true },
                { label: "See the email address of the Google account you connect", granted: true },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              Storage and bandwidth are billed by Google directly to your account. FireOTA charges nothing per release.
            </p>
          </div>
        </WizardShell>
      )}

      {step === 1 && (
        <WizardShell
          steps={steps}
          current={1}
          title="Select a project"
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
          {selectable.isLoading ? (
            <SkeletonRows rows={3} cols={2} />
          ) : (
            <Field
              label="Firebase project"
              aside={<HelpHint>You can connect more projects later — one per environment is a common setup.</HelpHint>}
            >
              <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
                {[...(selectable.data ?? [])]
                  .sort((a, b) => Number(a.connected) - Number(b.connected))
                  .map((project) => (
                  <label
                    key={project.id}
                    title={project.connected ? "Already connected to this workspace" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md border border-border px-3 py-2.5",
                      project.connected ? "cursor-not-allowed bg-surface-2/20 opacity-60" : "cursor-pointer bg-surface-2/40",
                    )}
                  >
                    <RadioGroupItem value={project.id} disabled={project.connected} />
                    <span className="text-[12px]">{project.name}</span>
                    <span className="font-mono text-[10px] text-faint">{project.id}</span>
                    {project.connected ? (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                        <Check className="size-3" aria-hidden /> Already connected
                      </span>
                    ) : (
                      <span className="ml-auto font-mono text-[10px] text-faint">{project.region}</span>
                    )}
                  </label>
                ))}
              </RadioGroup>
            </Field>
          )}
        </WizardShell>
      )}

      {step === 2 && (
        <WizardShell
          steps={steps}
          current={2}
          title="Verify the connection"
          description="FireOTA writes a test object, reads it back and removes it."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              {verified ? (
                <Button size="sm" onClick={() => void navigate({ to: "/projects" })}>
                  Done
                </Button>
              ) : (
                <div className="flex gap-2">
                  {result ? (
                    <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/projects" })}>
                      Finish later
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={verifying}
                    onClick={async () => {
                      setVerifying(true);
                      try {
                        const checked = await firebaseService.verify(selected);
                        setResult(checked);
                        // Only a writable bucket counts as verified; anything else stays on this step.
                        setVerified(checked.status === "connected");
                        if (checked.status === "connected") toast.success("Firebase project connected and verified.");
                        else toast.warning("Project connected, but Storage is not writable yet. Fix it and verify again.");
                      } catch (error) {
                        toast.error(friendlyError(error, "Verification failed. Check the bucket permissions and retry."));
                      } finally {
                        setVerifying(false);
                      }
                    }}
                  >
                    {verifying ? "Verifying…" : result ? "Verify again" : "Run verification"}
                  </Button>
                </div>
              )}
            </>
          }
        >
          <ul className="space-y-2.5">
            {checks.map((check) => (
              <li key={check.label} className="flex items-start gap-2.5 text-[13px]">
                {verifying ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" aria-hidden />
                ) : check.ok === null ? (
                  <Circle className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                ) : check.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                )}
                <span>
                  <span className={check.ok === false ? "font-medium" : check.ok === null ? "text-muted-foreground" : ""}>
                    {check.label}
                  </span>
                  {check.ok === false && !verifying ? (
                    <span className="block text-[12px] text-muted-foreground">{check.fix}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {result && !verified && !verifying ? (
            <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12px]">
              The project is saved, but FireOTA can't publish updates until Storage is writable. Fix the items above in the{" "}
              {writeFailure === "billing" ? (
                <a
                  href={`https://console.cloud.google.com/billing/linkedaccount?project=${encodeURIComponent(selected)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand underline-offset-2 hover:underline"
                >
                  Google Cloud billing settings
                </a>
              ) : (
                <a
                  href={`https://console.firebase.google.com/project/${encodeURIComponent(selected)}/storage`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand underline-offset-2 hover:underline"
                >
                  Firebase console
                </a>
              )}
              , then press <strong>Verify again</strong>.
            </p>
          ) : null}
        </WizardShell>
      )}
    </AppShell>
  );
}
