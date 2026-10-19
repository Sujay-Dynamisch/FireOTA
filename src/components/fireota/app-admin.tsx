/** Admin panels of the application page: runtimes, code signing and deletion. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Layers, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import {
  CodeBlock,
  EmptyState,
  PlatformTag,
  SectionCard,
  SkeletonRows,
  StatusBadge,
} from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { q } from "@/lib/queries";
import type { AppRecord } from "@/lib/types";
import { appsService } from "@/services";

/**
 * Expo-style runtime view: each store build has a runtime version, and every OTA update
 * belongs to exactly one runtime. Devices only ever receive updates for their runtime.
 */
export function RuntimesPanel({ app }: { app: AppRecord }) {
  const runtimes = useQuery(q.runtimes(app.id));
  if (runtimes.isLoading) {
    return (
      <SectionCard title="Runtimes">
        <SkeletonRows rows={15} cols={4} />
      </SectionCard>
    );
  }
  const list = runtimes.data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        A <strong>runtime version</strong> identifies the native code of a store build (Play Store /
        App Store). OTA updates are identified by their own ID and attach to exactly one runtime — a
        phone only receives updates made for the runtime it is running. Bump the runtime whenever
        you ship new native code.
      </p>
      {list.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Layers}
            title="No runtimes yet."
            description="Publish an update or run a build with the SDK to see it here."
            compact
          />
        </SectionCard>
      ) : null}
      {list.map((runtime) => (
        <SectionCard
          key={runtime.runtimeVersion}
          title={
            <span className="flex items-center gap-2">
              <span className="font-mono">runtime {runtime.runtimeVersion}</span>
              {runtime.isCurrent ? (
                <span className="rounded-sm bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] text-brand">
                  current store build
                </span>
              ) : null}
            </span>
          }
          aside={
            <span className="font-mono text-[10px] text-faint">
              {runtime.devices.android} Android · {runtime.devices.ios} iOS devices ·{" "}
              {runtime.updateCount} updates
            </span>
          }
        >
          {runtime.updates.length === 0 ? (
            <p className="p-4 text-[12px] text-muted-foreground">
              No OTA updates for this runtime yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {runtime.updates.map((update) => (
                <li
                  key={update.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12px]"
                >
                  <Link
                    to="/releases/$releaseId"
                    params={{ releaseId: update.id }}
                    className="font-mono hover:text-brand"
                  >
                    {update.label}
                  </Link>
                  <PlatformTag platform={update.platform} />
                  <StatusBadge status={update.status as never} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {update.message || "—"}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{update.createdAt}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

export function CodeSigningPanel({ app, canEdit }: { app: AppRecord; canEdit: boolean }) {
  const client = useQueryClient();
  const signing = app.codeSigning ?? { keyId: null, required: false };
  const [pem, setPem] = useState("");
  const save = useMutation({
    mutationFn: (input: { publicKeyPem?: string | null; required: boolean }) =>
      appsService.setSigning(app.id, input),
    onSuccess: () => {
      toast.success("Code signing updated.");
      setPem("");
      void client.invalidateQueries({ queryKey: ["apps"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update code signing."),
  });

  return (
    <div className="space-y-3">
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            {signing.keyId ? (
              <ShieldCheck className="size-4 text-success" />
            ) : (
              <ShieldOff className="size-4 text-faint" />
            )}
            Code signing
          </span>
        }
        aside={
          <span className="font-mono text-[10px] text-faint">
            {signing.keyId ? `key ${signing.keyId}` : "not configured"} ·{" "}
            {signing.required ? "required" : "optional"}
          </span>
        }
      >
        <div className="space-y-4 p-4 text-[12px]">
          <p className="text-muted-foreground">
            Signed updates prove an update was built by you. Your{" "}
            <strong>private key never leaves your machine or CI</strong>; FireOTA and the app only
            hold the public key. With signing on, the server rejects uploads with a wrong signature,
            and the SDK refuses to install any update whose signature does not match the certificate
            embedded in the app — even if your FireOTA account or Firebase bucket were compromised.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              Generate a key pair locally:
              <CodeBlock code="npx fireota signing generate --out ./fireota-keys" />
            </li>
            <li>
              Paste the public key below. Keep{" "}
              <code className="font-mono">fireota-private.pem</code> out of git (store it as a CI
              secret).
            </li>
            <li>
              Embed the same public key in the app and publish with the private key:
              <CodeBlock
                language="tsx"
                code={`FireOTA.configure({\n  // …\n  codeSigningCertificate: PUBLIC_KEY_PEM, // contents of fireota-public.pem\n});`}
              />
              <CodeBlock code="npx fireota publish … --private-key ./fireota-keys/fireota-private.pem" />
            </li>
          </ol>

          {canEdit ? (
            <div className="space-y-3 border-t border-border pt-4">
              <label
                className="block font-mono text-[10px] uppercase tracking-[0.1em] text-faint"
                htmlFor="signing-pem"
              >
                {signing.keyId ? "Replace public key" : "Public key (PEM)"}
              </label>
              <Textarea
                id="signing-pem"
                value={pem}
                onChange={(e) => setPem(e.target.value)}
                placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"}
                className="min-h-28 font-mono text-[11px]"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  disabled={!pem.includes("BEGIN PUBLIC KEY") || save.isPending}
                  loading={save.isPending}
                  onClick={() => save.mutate({ publicKeyPem: pem, required: signing.required })}
                >
                  <KeyRound /> Save public key
                </Button>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={signing.required}
                    disabled={!signing.keyId || save.isPending}
                    onCheckedChange={(required) => save.mutate({ required })}
                    aria-label="Require signed updates"
                  />
                  Require signed updates
                </label>
                {signing.keyId ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="ml-auto text-danger">
                        Remove key
                      </Button>
                    }
                    title="Remove the code signing key"
                    description="Updates will no longer be verified by the server. Apps that embed the certificate will reject unsigned updates."
                    confirmLabel="Remove key"
                    destructive
                    requireTyped="REMOVE"
                    onConfirm={async () => {
                      await save.mutateAsync({ publicKeyPem: null, required: false });
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

export function DeleteAppPanel({ app }: { app: AppRecord }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => appsService.remove(app.id, app.slug),
    onSuccess: (result) => {
      toast.success(
        `${app.name} deleted.${result.artifactsKept ? ` ${result.artifactsKept} bundle(s) could not be removed from Firebase and stay in your bucket.` : ""}`,
      );
      void client.invalidateQueries({ queryKey: ["apps"] });
      void navigate({ to: "/apps" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete the application."),
  });
  return (
    <SectionCard title={<span className="text-danger">Danger zone</span>}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-[12px]">
        <div>
          <p className="font-medium">Delete this application</p>
          <p className="text-muted-foreground">
            Removes its channels, updates, rollouts and device telemetry, and deletes its bundles
            from your Firebase bucket.
          </p>
        </div>
        <ConfirmAction
          trigger={
            <Button variant="destructive" size="sm">
              Delete application
            </Button>
          }
          title={`Delete ${app.name}`}
          description="Phones keep the update they already run but will not receive new ones. This cannot be undone."
          warning="Every channel, update and rollout of this application is deleted."
          confirmLabel="Delete application"
          destructive
          requireTyped={app.slug}
          details={[
            { label: "Application", value: app.name },
            { label: "Application ID", value: app.slug },
          ]}
          onConfirm={async () => {
            await remove.mutateAsync();
          }}
        />
      </div>
    </SectionCard>
  );
}
