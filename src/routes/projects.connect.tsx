import { friendlyError } from "@/lib/friendly-error";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Cloud,
  CheckCircle2,
  HardDrive,
  Globe,
  Flame,
  Server,
  Database,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { HelpHint, PageHeader } from "@/components/fireota/primitives";
import { CheckList, Field, WizardShell } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { FirebaseProject, StorageProviderType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { firebaseService, storageService } from "@/services";

export const Route = createFileRoute("/projects/connect")({
  head: () => ({
    meta: [
      { title: "Connect Storage — FireOTA" },
      {
        name: "description",
        content: "Connect your own storage: Cloudflare R2, AWS S3, MinIO, GCS, Azure, or Firebase.",
      },
      { property: "og:title", content: "Connect Storage — FireOTA" },
      { property: "og:description", content: "Zero-proxy sovereign storage for your mobile updates." },
    ],
  }),
  component: ConnectStoragePage,
});

const PROVIDERS = [
  {
    id: "r2" as StorageProviderType,
    name: "Cloudflare R2",
    tagline: "Recommended · Zero egress fees, 1-minute API token setup",
    icon: Cloud,
    badge: "Most Popular",
  },
  {
    id: "s3" as StorageProviderType,
    name: "Amazon S3",
    tagline: "Standard AWS S3 bucket with IAM credentials",
    icon: HardDrive,
  },
  {
    id: "minio" as StorageProviderType,
    name: "Self-Hosted / MinIO",
    tagline: "Private cloud, air-gapped, or on-premise S3 endpoint",
    icon: Server,
  },
  {
    id: "gcs" as StorageProviderType,
    name: "Google Cloud Storage",
    tagline: "Service account JSON key without OAuth consent screens",
    icon: Database,
  },
  {
    id: "azure" as StorageProviderType,
    name: "Azure Blob Storage",
    tagline: "Microsoft Azure storage container with shared access key",
    icon: HardDrive,
  },
  {
    id: "external" as StorageProviderType,
    name: "Bring Your Own URL (BYOU)",
    tagline: "Host bundles on your own CDN/server; specify URLs during release",
    icon: Globe,
  },
  {
    id: "firebase" as StorageProviderType,
    name: "Google Firebase (OAuth)",
    tagline: "Connect via Google account and OAuth consent flow",
    icon: Flame,
  },
];

function ConnectStoragePage() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<StorageProviderType>("r2");
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [publicCdnUrl, setPublicCdnUrl] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [azureAccountName, setAzureAccountName] = useState("");
  const [azureAccountKey, setAzureAccountKey] = useState("");

  const [saving, setSaving] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    ok: boolean;
    message?: string;
  } | null>(null);

  // Firebase OAuth callback detection:
  const [firebaseStep, setFirebaseStep] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("status") === "connected" ? 1 : 0,
  );
  const [authorizing, setAuthorizing] = useState(false);
  const [selectedFirebase, setSelectedFirebase] = useState("");

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    if (status === "connected") {
      setProvider("firebase");
      setFirebaseStep(1);
      toast.success("Google account authorized. Choose a Firebase project.", { id: "google-oauth" });
    }
  }, []);

  const firebaseSelectable = useQuery({
    queryKey: ["firebase-selectable"],
    queryFn: () => firebaseService.listSelectable(),
    enabled: provider === "firebase" && firebaseStep >= 1,
    retry: false,
  });

  const handleConnect = async () => {
    setSaving(true);
    setVerificationResult(null);

    try {
      if (provider === "firebase") {
        if (!selectedFirebase) throw new Error("Select a Firebase project first.");
        await firebaseService.verify(selectedFirebase);
        toast.success("Firebase project connected and verified!");
        void navigate({ to: "/projects" });
        return;
      }

      let credentials: Record<string, unknown> | undefined;
      if (provider === "s3" || provider === "r2" || provider === "minio") {
        credentials = {
          accessKeyId,
          secretAccessKey,
          endpoint: endpoint || undefined,
          region: region || undefined,
          publicCdnUrl: publicCdnUrl || undefined,
        };
      } else if (provider === "gcs") {
        credentials = { serviceAccountJson };
      } else if (provider === "azure") {
        credentials = {
          accountName: azureAccountName,
          accountKey: azureAccountKey,
          containerName: bucket,
          endpoint: endpoint || undefined,
        };
      }

      const res = await storageService.create({
        name: name || `${PROVIDERS.find((p) => p.id === provider)?.name} Target`,
        provider,
        bucket: bucket || undefined,
        endpoint: endpoint || undefined,
        region: region || undefined,
        publicCdnUrl: publicCdnUrl || undefined,
        credentials,
      });

      setVerificationResult(res.verification);

      if (res.verification.ok) {
        toast.success("Storage target verified and connected successfully!");
        setTimeout(() => void navigate({ to: "/projects" }), 1000);
      } else {
        toast.error(`Connected with issues: ${res.verification.message || "Write probe failed."}`);
      }
    } catch (err) {
      toast.error(friendlyError(err, "Failed to connect storage target."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Storage", to: "/projects" },
        { label: "Connect" },
      ]}
    >
      <PageHeader
        title="Connect Storage Target"
        description="FireOTA never stores customer bundles. Bundles stay 100% inside your own cloud storage."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Provider Selector */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Select Cloud Storage</p>
          <div className="space-y-1.5">
            {PROVIDERS.map((p) => {
              const Icon = p.icon;
              const isSelected = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProvider(p.id);
                    setVerificationResult(null);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 text-foreground shadow-xs"
                      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/40",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] text-foreground">{p.name}</span>
                      {p.badge && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug">{p.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Configuration Form */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <h3 className="font-semibold text-[15px] text-foreground">
              Configure {PROVIDERS.find((p) => p.id === provider)?.name}
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Credentials are encrypted at rest with AES-256-GCM. FireOTA uses them solely to upload update packages and generate download tokens.
            </p>

            <div className="mt-6 space-y-4">
              <Field label="Target Name" hint="Friendly display name in the dashboard">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Production ${PROVIDERS.find((p) => p.id === provider)?.name}`}
                  className="h-9 text-[12px]"
                />
              </Field>

              {/* Cloudflare R2 */}
              {provider === "r2" && (
                <>
                  <Field label="Bucket Name" hint="The exact bucket name created in Cloudflare R2">
                    <Input
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value)}
                      placeholder="fireota-releases"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="Endpoint / S3 API URL" hint="https://<account_id>.r2.cloudflarestorage.com">
                    <Input
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://abc123456789.r2.cloudflarestorage.com"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Access Key ID">
                      <Input
                        value={accessKeyId}
                        onChange={(e) => setAccessKeyId(e.target.value)}
                        placeholder="R2 API Token Access Key"
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                    <Field label="Secret Access Key">
                      <Input
                        type="password"
                        value={secretAccessKey}
                        onChange={(e) => setSecretAccessKey(e.target.value)}
                        placeholder="••••••••••••••••••••••••"
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                  </div>
                  <Field label="Public Custom Domain / CDN (Optional)" hint="e.g. https://updates.yourdomain.com">
                    <Input
                      value={publicCdnUrl}
                      onChange={(e) => setPublicCdnUrl(e.target.value)}
                      placeholder="https://cdn.mycompany.com"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                </>
              )}

              {/* AWS S3 */}
              {provider === "s3" && (
                <>
                  <Field label="S3 Bucket Name">
                    <Input
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value)}
                      placeholder="my-company-ota-releases"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="AWS Region">
                    <Input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="us-east-1"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="IAM Access Key ID">
                      <Input
                        value={accessKeyId}
                        onChange={(e) => setAccessKeyId(e.target.value)}
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                    <Field label="IAM Secret Access Key">
                      <Input
                        type="password"
                        value={secretAccessKey}
                        onChange={(e) => setSecretAccessKey(e.target.value)}
                        placeholder="••••••••••••••••••••••••"
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                  </div>
                  <Field label="CloudFront / CDN Base URL (Optional)">
                    <Input
                      value={publicCdnUrl}
                      onChange={(e) => setPublicCdnUrl(e.target.value)}
                      placeholder="https://d111111abcdef8.cloudfront.net"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                </>
              )}

              {/* MinIO / Self-Hosted */}
              {provider === "minio" && (
                <>
                  <Field label="Bucket Name">
                    <Input
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value)}
                      placeholder="app-bundles"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="MinIO Server Endpoint">
                    <Input
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://minio.internal.mycompany.com:9000"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="MinIO Access Key">
                      <Input
                        value={accessKeyId}
                        onChange={(e) => setAccessKeyId(e.target.value)}
                        placeholder="minioadmin"
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                    <Field label="MinIO Secret Key">
                      <Input
                        type="password"
                        value={secretAccessKey}
                        onChange={(e) => setSecretAccessKey(e.target.value)}
                        placeholder="••••••••••••••••••••••••"
                        className="h-9 font-mono text-[12px]"
                      />
                    </Field>
                  </div>
                </>
              )}

              {/* Google Cloud Storage (Service Account) */}
              {provider === "gcs" && (
                <>
                  <Field label="GCS Bucket Name">
                    <Input
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value)}
                      placeholder="my-gcs-releases-bucket"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="Service Account JSON Key" hint="Paste the JSON file downloaded from Google Cloud IAM">
                    <Textarea
                      rows={6}
                      value={serviceAccountJson}
                      onChange={(e) => setServiceAccountJson(e.target.value)}
                      placeholder='{ "type": "service_account", "project_id": "...", ... }'
                      className="font-mono text-[11px]"
                    />
                  </Field>
                </>
              )}

              {/* Azure Blob Storage */}
              {provider === "azure" && (
                <>
                  <Field label="Blob Container Name">
                    <Input
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value)}
                      placeholder="ota-bundles"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="Azure Storage Account Name">
                    <Input
                      value={azureAccountName}
                      onChange={(e) => setAzureAccountName(e.target.value)}
                      placeholder="myazurestorageaccount"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="Account Access Key">
                    <Input
                      type="password"
                      value={azureAccountKey}
                      onChange={(e) => setAzureAccountKey(e.target.value)}
                      placeholder="••••••••••••••••••••••••"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                </>
              )}

              {/* Bring Your Own URL (BYOU) */}
              {provider === "external" && (
                <>
                  <Field label="Default CDN / Artifact Base URL" hint="Optional base URL prefix for update bundles">
                    <Input
                      value={publicCdnUrl}
                      onChange={(e) => setPublicCdnUrl(e.target.value)}
                      placeholder="https://cdn.mycompany.com/releases"
                      className="h-9 font-mono text-[12px]"
                    />
                  </Field>
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                    <p className="font-medium text-foreground">How Bring-Your-Own-URL works:</p>
                    <p className="mt-1">
                      Your CI/CD builds the bundle, uploads it to your own web server or CDN, and tells FireOTA:
                      <code className="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                        fireota release --bundle-url https://... --bundle-hash ... --bundle-size ...
                      </code>
                    </p>
                  </div>
                </>
              )}

              {/* Firebase OAuth */}
              {provider === "firebase" && (
                <div className="space-y-4">
                  {firebaseStep === 0 ? (
                    <div className="space-y-3">
                      <p className="text-[12px] text-muted-foreground">
                        Authorize FireOTA to access your Firebase project storage bucket using Google OAuth.
                      </p>
                      <Button
                        size="sm"
                        disabled={authorizing}
                        onClick={async () => {
                          setAuthorizing(true);
                          try {
                            await firebaseService.reconnect();
                          } catch (err) {
                            setAuthorizing(false);
                            toast.error(friendlyError(err, "Could not start Google sign-in."));
                          }
                        }}
                      >
                        {authorizing ? "Opening Google…" : "Continue with Google"}
                      </Button>
                    </div>
                  ) : (
                    <Field label="Select Firebase Project">
                      <Select value={selectedFirebase} onValueChange={setSelectedFirebase}>
                        <SelectTrigger className="h-9 text-[12px]">
                          <SelectValue placeholder="Pick a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {(firebaseSelectable.data ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.firebaseId} · {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>
              )}

              {/* Verification Feedback */}
              {verificationResult && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-[12px]",
                    verificationResult.ok
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-destructive/20 bg-destructive/10 text-destructive",
                  )}
                >
                  {verificationResult.ok ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0" />
                  )}
                  <span>
                    {verificationResult.ok
                      ? "Write, read, and delete permissions successfully verified!"
                      : `Verification issue: ${verificationResult.message || "Failed to write probe file."}`}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/projects" })}>
                  Cancel
                </Button>
                <Button size="sm" disabled={saving} onClick={handleConnect}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Testing & Connecting…
                    </>
                  ) : (
                    <>
                      Verify & Connect
                      <ArrowRight className="ml-1.5 size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
