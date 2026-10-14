import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { DataTable, type Column } from "@/components/fireota/data-table";
import { EmptyState, PageHeader } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { q } from "@/lib/queries";
import type { AuditEvent } from "@/lib/types";

export const Route = createFileRoute("/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit logs — FireOTA" },
      {
        name: "description",
        content: "An immutable record of every release, rollout, permission and key change in your organization.",
      },
      { property: "og:title", content: "Audit logs — FireOTA" },
      { property: "og:description", content: "Immutable audit trail for every OTA action." },
    ],
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const [result, setResult] = useState("all");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const audit = useQuery(q.audit(result === "all" ? undefined : { result }));

  const columns: Column<AuditEvent>[] = [
    {
      key: "at",
      header: "Timestamp",
      sortValue: (row) => row.at,
      render: (row) => <span className="font-mono text-[11px] text-muted-foreground">{row.at}</span>,
    },
    { key: "actor", header: "Actor", sortValue: (row) => row.actor, render: (row) => row.actor },
    { key: "action", header: "Action", render: (row) => <span className="font-mono text-[11px]">{row.action}</span> },
    {
      key: "resource",
      header: "Resource",
      render: (row) => (
        <span>
          <span className="font-mono text-[11px]">{row.resource}</span>{" "}
          <span className="font-mono text-[10px] text-faint">{row.resourceId}</span>
        </span>
      ),
    },
    { key: "app", header: "Application", optional: true, render: (row) => row.appName },
    {
      key: "result",
      header: "Result",
      render: (row) => (
        <span className={`font-mono text-[10px] ${row.result === "success" ? "text-success" : "text-danger"}`}>
          {row.result.toUpperCase()}
        </span>
      ),
    },
    { key: "ip", header: "IP", optional: true, render: (row) => <span className="font-mono text-[11px]">{row.ip}</span> },
  ];

  return (
    <AppShell breadcrumb={[{ label: "Helio Labs", to: "/dashboard" }, { label: "Audit logs" }]}>
      <PageHeader
        title="Audit logs"
        description="Every privileged action is recorded and cannot be edited."
        actions={
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="h-8 w-[150px] text-[12px]" aria-label="Filter by result">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <DataTable
        rows={audit.data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={audit.isLoading}
        error={audit.error as Error | null}
        pageSize={15}
        searchPlaceholder="Search by actor, action or resource…"
        searchValue={(row) => `${row.actor} ${row.action} ${row.resource} ${row.resourceId} ${row.requestId}`}
        onRowClick={(row) => setSelected(row)}
        emptyState={<EmptyState icon={ScrollText} title="No audit events match these filters." />}
      />

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.action}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ["Timestamp", selected.at],
                  ["Actor", selected.actor],
                  ["Resource", `${selected.resource} ${selected.resourceId}`],
                  ["Application", selected.appName],
                  ["Result", selected.result],
                  ["IP address", selected.ip],
                  ["Request ID", selected.requestId],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
                    <dd className="font-mono text-[11px]">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-surface-2/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Before</p>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{selected.before}</pre>
                </div>
                <div className="rounded-md border border-border bg-surface-2/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">After</p>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{selected.after}</pre>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
