import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Webhook as WebhookIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { CodeBlock, CopyButton, EmptyState, PageHeader, SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { q } from "@/lib/queries";
import { webhooksService } from "@/services";

export const Route = createFileRoute("/settings/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — FireOTA" },
      {
        name: "description",
        content: "Send release, rollout and rollback events to Slack, PagerDuty or your own signed endpoint.",
      },
      { property: "og:title", content: "Webhooks — FireOTA" },
      { property: "og:description", content: "Signed webhook delivery for every OTA event." },
    ],
  }),
  component: WebhooksPage,
});

/** Must match WEBHOOK_EVENTS on the server. */
const eventTypes = [
  "release.created",
  "release.ready",
  "release.published",
  "release.paused",
  "release.rolled_back",
  "release.failed",
  "release.archived",
  "release.deleted",
  "rollout.updated",
  "rollout.completed",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "app.created",
  "app.deleted",
  "firebase.disconnected",
  "firebase.expired",
  "agent.approval_requested",
  "security.alert",
];

const VERIFY_SNIPPET = `// Node.js — verify a FireOTA webhook (Express example; use the raw body)
import crypto from "node:crypto";

app.post("/fireota", express.raw({ type: "application/json" }), (req, res) => {
  const timestamp = req.header("x-fireota-timestamp");
  const signature = req.header("x-fireota-signature"); // "sha256=<hex>"
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.FIREOTA_WEBHOOK_SECRET)
    .update(\`\${timestamp}.\${req.body}\`)
    .digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300; // reject replays
  const valid = signature?.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!fresh || !valid) return res.status(401).end();
  const event = JSON.parse(req.body); // { event, id, createdAt, data }
  res.status(200).end();
});`;

function EventPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
      {eventTypes.map((event) => (
        <label key={event} className="flex items-center gap-2 font-mono text-[11px]">
          <Checkbox
            checked={value.includes(event)}
            onCheckedChange={(checked) => onChange(checked ? [...value, event] : value.filter((e) => e !== event))}
          />
          {event}
        </label>
      ))}
    </div>
  );
}

function SecretNotice({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy the signing secret</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">
          Your endpoint uses this secret to verify the <code className="font-mono">x-fireota-signature</code> header. It is shown only
          once — store it as <code className="font-mono">FIREOTA_WEBHOOK_SECRET</code>.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/50 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{secret}</code>
          <CopyButton value={secret} label="Copy secret" />
        </div>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            I have stored it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhooksPage() {
  const client = useQueryClient();
  // The result is read back from the delivery log, so the toast reports what really happened.
  const sendTest = useMutation({
    mutationFn: (id: string) => webhooksService.test(id),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Test event delivered (HTTP ${result.status}, ${result.latencyMs} ms).`);
      else toast.error(`Delivery failed: ${result.error ?? `HTTP ${result.status || "no response"}`}. Check the endpoint and its logs.`);
      void client.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send the test event."),
  });
  const { can } = usePermissions();
  const webhooks = useQuery(q.webhooks());
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [events, setEvents] = useState<string[]>(["release.published", "release.rolled_back", "security.alert"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; events: string[] } | null>(null);

  const refresh = () => void client.invalidateQueries({ queryKey: ["webhooks"] });
  const onError = (error: unknown) => toast.error(error instanceof Error ? error.message : "Something went wrong.");

  const create = useMutation({
    mutationFn: () => webhooksService.create({ endpoint, events }),
    onSuccess: (result) => {
      setOpen(false);
      setEndpoint("");
      setSecret(result.secret);
      refresh();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { events?: string[]; status?: "active" | "paused"; rotateSecret?: boolean } }) =>
      webhooksService.update(id, patch),
    onSuccess: (result, variables) => {
      if (result.secret) setSecret(result.secret);
      else toast.success(variables.patch.status ? `Webhook ${variables.patch.status === "paused" ? "paused" : "resumed"}.` : "Webhook updated.");
      setEditing(null);
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => webhooksService.remove(id),
    onSuccess: () => {
      toast.success("Webhook deleted.");
      refresh();
    },
    onError,
  });

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Settings", to: "/settings" },
        { label: "Webhooks" },
      ]}
    >
      <PageHeader
        title="Webhooks"
        description="Every delivery is signed (HMAC-SHA256 + timestamp) so your endpoint can verify it came from FireOTA. Failed deliveries are retried with backoff."
        actions={
          !can("webhook.create") ? null : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add webhook</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a webhook</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Field label="Endpoint URL" htmlFor="endpoint" hint="Must be HTTPS and respond within 5 seconds.">
                  <Input
                    id="endpoint"
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                    placeholder="https://hooks.company.com/fireota"
                    className="h-9 font-mono text-[12px]"
                  />
                </Field>
                <Field label="Events">
                  <EventPicker value={events} onChange={setEvents} />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!endpoint.startsWith("https://") || events.length === 0 || create.isPending}
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? "Creating…" : "Add webhook"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )
        }
      />

      {secret ? <SecretNotice secret={secret} onClose={() => setSecret(null)} /> : null}
      {editing ? (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit subscribed events</DialogTitle>
            </DialogHeader>
            <EventPicker value={editing.events} onChange={(next) => setEditing({ ...editing, events: next })} />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={editing.events.length === 0 || update.isPending}
                onClick={() => update.mutate({ id: editing.id, patch: { events: editing.events } })}
              >
                Save events
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {webhooks.isLoading ? (
        <SectionCard>
          <SkeletonRows rows={3} cols={4} />
        </SectionCard>
      ) : (webhooks.data ?? []).length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks configured."
            description="Get notified in Slack or PagerDuty when a rollout degrades."
          />
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {(webhooks.data ?? []).map((hook) => (
            <SectionCard
              key={hook.id}
              title={<span className="font-mono text-[12px]">{hook.endpoint}</span>}
              aside={
                <span
                  className={`font-mono text-[10px] ${
                    hook.status === "active" ? "text-success" : hook.status === "failing" ? "text-danger" : "text-warning"
                  }`}
                >
                  {hook.status.toUpperCase()} · {hook.successRate}% delivered
                </span>
              }
            >
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {hook.events.map((event) => (
                    <span key={event} className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {event}
                    </span>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-faint">
                  created {hook.created} · last delivery {hook.lastDelivery} ·{" "}
                  {hook.secretSet ? "signing secret set" : "no signing secret"}
                </p>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Recent deliveries</p>
                  <ul className="mt-1.5 space-y-1">
                    {hook.deliveries.map((delivery) => (
                      <li key={delivery.id} className="flex flex-wrap items-center gap-x-3 font-mono text-[11px]">
                        <span>{delivery.event}</span>
                        <span className={delivery.succeeded ?? (delivery.status > 0 && delivery.status < 300) ? "text-success" : "text-danger"}>
                          {delivery.status || "—"}
                        </span>
                        <span className="text-muted-foreground">{delivery.latency}</span>
                        <span className="text-faint">attempt {delivery.attempt}</span>
                        {delivery.error ? <span className="text-danger">{delivery.error}</span> : null}
                        {delivery.retry ? <span className="text-warning">{delivery.retry}</span> : null}
                        <span className="ml-auto text-faint">{delivery.at}</span>
                      </li>
                    ))}
                    {hook.deliveries.length === 0 ? (
                      <li className="font-mono text-[11px] text-faint">No deliveries yet — send a test event.</li>
                    ) : null}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {can("webhook.update") ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={sendTest.isPending}
                        onClick={() => sendTest.mutate(hook.id)}
                      >
                        {sendTest.isPending && sendTest.variables === hook.id ? "Sending…" : "Send test event"}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setEditing({ id: hook.id, events: hook.events })}>
                        Edit events
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: hook.id, patch: { status: hook.status === "paused" ? "active" : "paused" } })}
                      >
                        {hook.status === "paused" ? "Resume" : "Pause"}
                      </Button>
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm" className="h-7 text-[11px]">
                            Rotate secret
                          </Button>
                        }
                        title="Rotate the signing secret"
                        description="A new secret is generated and shown once. Deliveries are signed with it immediately — update your endpoint right away."
                        confirmLabel="Rotate secret"
                        onConfirm={async () => {
                          await update.mutateAsync({ id: hook.id, patch: { rotateSecret: true } });
                        }}
                      />
                    </>
                  ) : null}
                  {can("webhook.delete") ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] text-danger">
                        Delete
                      </Button>
                    }
                    title="Delete this webhook"
                    description="Events stop being delivered to this endpoint immediately."
                    confirmLabel="Delete webhook"
                    destructive
                    details={[
                      { label: "Endpoint", value: hook.endpoint },
                      { label: "Events", value: hook.events.length },
                    ]}
                    onConfirm={async () => {
                      await remove.mutateAsync(hook.id);
                    }}
                  />
                  ) : null}
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <SectionCard title="Verify signatures on your server">
        <div className="space-y-2 p-4">
          <p className="text-[12px] text-muted-foreground">
            Each request carries <code className="font-mono">x-fireota-event</code>, <code className="font-mono">x-fireota-delivery</code>,{" "}
            <code className="font-mono">x-fireota-timestamp</code> and <code className="font-mono">x-fireota-signature</code>. Respond with any
            2xx within 4 seconds; other responses are retried up to 6 times with exponential backoff.
          </p>
          <CodeBlock language="js" code={VERIFY_SNIPPET} />
        </div>
      </SectionCard>
    </AppShell>
  );
}
