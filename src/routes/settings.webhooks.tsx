import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Webhook as WebhookIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmAction } from "@/components/fireota/confirm-dialog";
import { EmptyState, PageHeader, SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

const eventTypes = [
  "release.published",
  "release.rolled_back",
  "rollout.updated",
  "rollout.paused",
  "firebase.connection_lost",
];

function WebhooksPage() {
  const client = useQueryClient();
  // The result is read back from the delivery log, so the toast reports what really happened.
  const sendTest = useMutation({
    mutationFn: async (id: string) => {
      await webhooksService.test(id);
      return webhooksService.get(id);
    },
    onSuccess: (hook) => {
      const last = hook.deliveries[0];
      if (last && last.status >= 200 && last.status < 300) toast.success(`Test event delivered (HTTP ${last.status}).`);
      else toast.error(last ? `Delivery failed (HTTP ${last.status || "no response"}). It will be retried automatically.` : "No delivery was recorded.");
      void client.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send the test event."),
  });
  const webhooks = useQuery(q.webhooks());
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [events, setEvents] = useState<string[]>(["release.published", "release.rolled_back"]);

  const refresh = () => void client.invalidateQueries({ queryKey: ["webhooks"] });

  const create = useMutation({
    mutationFn: () => webhooksService.create({ endpoint, events }),
    onSuccess: () => {
      toast.success("Webhook created. A signing secret was generated for it.");
      setOpen(false);
      setEndpoint("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => webhooksService.remove(id),
    onSuccess: () => {
      toast.success("Webhook deleted.");
      refresh();
    },
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
        description="Every delivery is signed so your endpoint can verify it came from FireOTA."
        actions={
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
                  <div className="space-y-1.5">
                    {eventTypes.map((event) => (
                      <label key={event} className="flex items-center gap-2 font-mono text-[11px]">
                        <Checkbox
                          checked={events.includes(event)}
                          onCheckedChange={(checked) =>
                            setEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)))
                          }
                        />
                        {event}
                      </label>
                    ))}
                  </div>
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
        }
      />

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
                        <span className={delivery.status < 300 ? "text-success" : "text-danger"}>{delivery.status}</span>
                        <span className="text-muted-foreground">{delivery.latency}</span>
                        <span className="text-faint">attempt {delivery.attempt}</span>
                        <span className="ml-auto text-faint">{delivery.at}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={sendTest.isPending}
                    onClick={() => sendTest.mutate(hook.id)}>
                    Send test event
                  </Button>
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
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
