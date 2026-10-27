import { friendlyError } from "@/lib/friendly-error";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { HelpHint, PageHeader, SkeletonRows } from "@/components/fireota/primitives";
import { CheckList, Field, WizardShell } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
                {(selectable.data ?? []).map((project) => (
                  <label
                    key={project.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2.5"
                  >
                    <RadioGroupItem value={project.id} />
                    <span className="text-[12px]">{project.name}</span>
                    <span className="font-mono text-[10px] text-faint">{project.id}</span>
                    <span className="ml-auto font-mono text-[10px] text-faint">{project.region}</span>
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
                <Button
                  size="sm"
                  disabled={verifying}
                  onClick={async () => {
                    setVerifying(true);
                    try {
                      const result = await firebaseService.verify(selected);
                      setVerified(true);
                      if (result.status === "connected") toast.success("Firebase project connected and verified.");
                      else toast.warning("Project connected, but Storage is not writable yet. Fix it and verify again from Projects.");
                    } catch (error) {
                      toast.error(friendlyError(error, "Verification failed. Check the bucket permissions and retry."));
                    } finally {
                      setVerifying(false);
                    }
                  }}
                >
                  {verifying ? "Verifying…" : "Run verification"}
                </Button>
              )}
            </>
          }
        >
          <CheckList
            items={[
              { label: "Storage bucket reachable", granted: verified },
              { label: "Write test object", granted: verified },
              { label: "Read test object back", granted: verified },
              { label: "Firestore metadata collection created", granted: verified },
            ]}
          />
        </WizardShell>
      )}
    </AppShell>
  );
}
