/**
 * Illustrations for the docs: framed mock-ups of the dashboard, terminal, Xcode, Firebase console
 * and the app, drawn with the design tokens so they follow light and dark mode. Labels match the
 * real UI. To use a real screenshot instead, drop it in public/docs/ and pass `src` to <Figure>.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MIcon } from "./docs-ui";

export function Figure({
  caption,
  src,
  alt,
  children,
}: {
  caption: ReactNode;
  src?: string;
  alt?: string;
  children?: ReactNode;
}) {
  return (
    <figure className="my-1 space-y-2">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-2 p-3 sm:p-5">
        {src ? (
          <img
            src={src}
            alt={alt ?? ""}
            loading="lazy"
            className="mx-auto w-full rounded-md border border-border"
          />
        ) : (
          children
        )}
      </div>
      <figcaption className="flex gap-1.5 text-[12px] leading-snug text-muted-foreground">
        <MIcon name="image" className="mt-px text-[15px] text-faint" />
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/* --------------------------------- frames --------------------------------- */

export function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px] overflow-hidden rounded-md border border-border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-danger/60" />
          <span className="size-2 rounded-full bg-warning/60" />
          <span className="size-2 rounded-full bg-success/60" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {url}
        </span>
      </div>
      <div className="p-4 text-[12px]">{children}</div>
    </div>
  );
}

/** `$ cmd` lines are commands; lines starting with ✓ ! – are coloured like the CLI output. */
export function TerminalFrame({ title = "Terminal", lines }: { title?: string; lines: string[] }) {
  return (
    <div className="mx-auto max-w-[640px] overflow-hidden rounded-md border border-border bg-[#0f1115] shadow-sm">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <MIcon name="terminal" className="text-[14px] text-white/50" />
        <span className="font-mono text-[10px] text-white/50">{title}</span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-white/80">
        {lines.map((line, i) => {
          const t = line.trimStart();
          const tone = t.startsWith("$")
            ? "text-white"
            : t.startsWith("✓")
              ? "text-emerald-400"
              : t.startsWith("!")
                ? "text-amber-400"
                : t.startsWith("–")
                  ? "text-white/45"
                  : "";
          return (
            <div key={i} className={tone}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

export function PhoneFrame({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      className={cn(
        "relative mx-auto h-[300px] w-[160px] shrink-0 overflow-hidden rounded-[22px] border-[5px] border-foreground/80 shadow-md",
        dark ? "bg-[#111]" : "bg-white",
      )}
    >
      <div className="absolute left-1/2 top-1.5 z-10 h-2.5 w-12 -translate-x-1/2 rounded-full bg-foreground/80" />
      <div className="h-full pt-5 text-[9px] text-neutral-800">{children}</div>
    </div>
  );
}

function Btn({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium",
        primary ? "bg-brand text-white" : "border border-border bg-background text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function FieldMock({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-foreground">{label}</p>
      <div
        className={cn(
          "rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
      {hint ? <p className="text-[10px] text-faint">{hint}</p> : null}
    </div>
  );
}

function Highlight({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md ring-2 ring-brand ring-offset-2 ring-offset-background">
      {children}
    </div>
  );
}

/* ------------------------------ concept diagrams ------------------------------ */

export function UpdateFlowDiagram() {
  const nodes = [
    { icon: "laptop_mac", title: "You / CI", body: "npx fireota publish" },
    {
      icon: "local_fire_department",
      title: "FireOTA",
      body: "records the update, channel, rollout",
    },
    { icon: "cloud", title: "Your Firebase Storage", body: "stores the .fota package" },
    { icon: "smartphone", title: "Devices", body: "check, download, verify, apply" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {nodes.map((n, i) => (
        <div
          key={n.title}
          className="relative rounded-md border border-border bg-background p-3 text-center"
        >
          <MIcon name={n.icon} className="text-[22px] text-brand" />
          <p className="mt-1 text-[12px] font-semibold text-foreground">{n.title}</p>
          <p className="text-[11px] text-muted-foreground">{n.body}</p>
          {i < nodes.length - 1 ? (
            <MIcon
              name="arrow_forward"
              className="absolute -bottom-3.5 left-1/2 z-10 -translate-x-1/2 rotate-90 rounded-full bg-surface-2 text-[16px] text-faint sm:-right-3.5 sm:bottom-auto sm:left-auto sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0 sm:rotate-0"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function RuntimeMatchDiagram() {
  const rows = [
    { device: "Store build 1.3.0", update: "Update for runtime 1.3.0", ok: true },
    { device: "Store build 1.3.0", update: "Update for runtime 1.4.0", ok: false },
    { device: "Store build 1.0", update: "Update for runtime 1.0.0", ok: false },
  ];
  return (
    <div className="mx-auto max-w-[560px] space-y-2">
      {rows.map((r) => (
        <div key={r.update + r.device} className="flex items-center gap-2 text-[11px]">
          <span className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-foreground">
            {r.device}
          </span>
          <MIcon
            name={r.ok ? "check_circle" : "block"}
            filled
            className={cn("text-[18px]", r.ok ? "text-success" : "text-danger")}
          />
          <span className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-foreground">
            {r.update}
          </span>
        </div>
      ))}
      <p className="pt-1 text-center text-[10px] text-faint">
        Runtime versions are compared as exact text: “1.0” and “1.0.0” are different runtimes.
      </p>
    </div>
  );
}

export function LaunchLifecycleDiagram() {
  const steps = [
    { icon: "download", label: "Downloaded", note: "SHA-256 verified, kept in staging" },
    { icon: "schedule", label: "Pending", note: "waits for the next cold start" },
    { icon: "play_arrow", label: "Launched", note: "new bundle loads" },
    { icon: "verified", label: "Confirmed", note: "configure() was reached" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {steps.map((s) => (
          <div key={s.label} className="rounded-md border border-border bg-background p-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
              <MIcon name={s.icon} className="text-[16px] text-brand" />
              {s.label}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.note}</p>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-2.5 text-[11px] text-foreground">
        <MIcon name="undo" className="text-[16px] text-danger" />
        <span>
          <strong>Crash before configure()?</strong> On the next launch the bundle is discarded, the
          previous one is restored and an <code className="font-mono">install_failed</code> event is
          reported.
        </span>
      </div>
    </div>
  );
}

export function RolloutBucketsDiagram({ percent = 10 }: { percent?: number }) {
  return (
    <div className="mx-auto max-w-[360px] space-y-2">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}>
        {Array.from({ length: 100 }, (_, i) => (
          <span
            key={i}
            className={cn("aspect-square rounded-[2px]", i < percent ? "bg-brand" : "bg-border")}
          />
        ))}
      </div>
      <p className="text-center text-[10px] text-faint">
        Each device has a fixed bucket 0–99 from its installation ID. At {percent}% only buckets 0–
        {percent - 1} get the update; raising the percentage adds buckets, it never removes any.
      </p>
    </div>
  );
}

/* --------------------------- external tool mock-ups --------------------------- */

export function FirebaseStorageMock() {
  return (
    <BrowserFrame url="console.firebase.google.com/project/my-app/storage">
      <div className="flex gap-3">
        <div className="hidden w-28 shrink-0 space-y-1 text-[11px] text-muted-foreground sm:block">
          <p className="font-mono text-[9px] uppercase tracking-wider text-faint">Build</p>
          <p>Authentication</p>
          <p>Firestore</p>
          <p className="rounded bg-brand/15 px-1.5 py-0.5 font-medium text-brand">Storage</p>
          <p>Hosting</p>
        </div>
        <div className="flex-1 space-y-2 rounded-md border border-border p-3">
          <p className="text-[13px] font-semibold text-foreground">Storage</p>
          <p className="text-[11px] text-muted-foreground">
            Store and retrieve user-generated files like images, audio, and video.
          </p>
          <Highlight>
            <Btn primary>Get started</Btn>
          </Highlight>
          <p className="pt-1 font-mono text-[10px] text-faint">
            bucket → gs://my-app.firebasestorage.app
          </p>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function XcodeBridgingMock() {
  return (
    <div className="mx-auto max-w-[640px] overflow-hidden rounded-md border border-border bg-background text-[11px] shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2 text-muted-foreground">
        <span className="font-medium text-foreground">FireOTA_test</span>
        <span>General</span>
        <span>Signing &amp; Capabilities</span>
        <span className="rounded bg-brand/15 px-1.5 text-brand">Build Settings</span>
      </div>
      <div className="space-y-1 p-3">
        <p className="font-mono text-[10px] text-faint">Swift Compiler – General</p>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 rounded px-1 py-1 text-muted-foreground">
          <span>Install Generated Header</span>
          <span>Yes</span>
        </div>
        <Highlight>
          <div className="grid grid-cols-[1fr_1.4fr] gap-2 px-1 py-1">
            <span className="text-foreground">Objective-C Bridging Header</span>
            <span className="font-mono text-foreground">
              FireOTA_test/FireOTA_test-Bridging-Header.h
            </span>
          </div>
        </Highlight>
      </div>
    </div>
  );
}

/* ----------------------------- dashboard mock-ups ----------------------------- */

export function ConnectFirebaseMock() {
  const steps = ["Authorize a Google account", "Select a project", "Verify the connection"];
  return (
    <BrowserFrame url="fireota.example.com/projects/connect">
      <p className="text-[14px] font-semibold text-foreground">Connect Firebase</p>
      <p className="mb-3 text-[11px] text-muted-foreground">
        FireOTA never stores your bundles — your project does.
      </p>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn("rounded-md border p-2.5", i === 2 ? "border-brand" : "border-border")}
          >
            <p className="flex items-center gap-2 font-medium text-foreground">
              <span className="grid size-5 place-items-center rounded-full bg-surface-2 font-mono text-[10px]">
                {i < 2 ? "✓" : i + 1}
              </span>
              {s}
            </p>
            {i === 2 ? (
              <div className="mt-2 space-y-1 pl-7 text-[11px]">
                <p className="flex items-center gap-1.5 text-success">
                  <MIcon name="check_circle" filled className="text-[14px]" /> Project reachable
                </p>
                <p className="flex items-center gap-1.5 text-success">
                  <MIcon name="check_circle" filled className="text-[14px]" /> Cloud Storage
                  read/write
                </p>
                <p className="pt-1 font-mono text-[10px] text-faint">
                  wrote and deleted fireota/.healthcheck
                </p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function AddAppMock() {
  return (
    <BrowserFrame url="fireota.example.com/apps/new">
      <p className="mb-3 text-[14px] font-semibold text-foreground">Add application</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldMock label="Application name" value="FireOTA test" />
        <FieldMock label="Slug" value="fireota-test" hint="Used by the CLI and API." mono />
        <FieldMock label="Destination project" value="my-app (Connected)" />
        <Highlight>
          <FieldMock
            label="Runtime version"
            value="1.0.0"
            hint="Must equal the store build's version."
            mono
          />
        </Highlight>
        <FieldMock label="Android package name" value="com.fireota.test" mono />
        <FieldMock label="iOS bundle identifier" value="com.fireota.test" mono />
      </div>
    </BrowserFrame>
  );
}

export function AppIdMock() {
  return (
    <BrowserFrame url="fireota.example.com/apps/83822cef-…">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-foreground">FireOTA test</p>
          <p className="text-[11px] text-muted-foreground">runtime 1.0.0 · Android, iOS</p>
        </div>
        <Btn primary>
          <MIcon name="add" className="text-[14px]" /> Create release
        </Btn>
      </div>
      <div className="mt-3">
        <Highlight>
          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-faint">App ID</span>
            <span className="truncate font-mono text-[11px] text-foreground">
              83822cef-18b1-453c-b67c-3c546a5439e8
            </span>
            <MIcon name="content_copy" className="text-[14px] text-muted-foreground" />
          </div>
        </Highlight>
      </div>
    </BrowserFrame>
  );
}

export function ChannelsMock() {
  const rows = [
    ["production", "Live traffic", "staged"],
    ["beta", "Opt-in testers", "immediate"],
    ["staging", "Internal verification", "immediate"],
    ["development", "Developer builds", "immediate"],
  ];
  return (
    <BrowserFrame url="fireota.example.com/channels">
      <div className="divide-y divide-border rounded-md border border-border">
        <div className="grid grid-cols-[1.2fr_1fr_0.8fr] px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-faint">
          <span>Channel</span>
          <span>Serving</span>
          <span>Policy</span>
        </div>
        {rows.map(([name, desc, policy]) => (
          <div key={name} className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center px-2 py-1.5">
            <span>
              <span className="font-mono text-foreground">{name}</span>
              <span className="block text-[10px] text-muted-foreground">{desc}</span>
            </span>
            <span className="font-mono text-[10px] text-faint">nothing yet</span>
            <span className="font-mono text-[10px] text-muted-foreground">{policy}</span>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

/** Releases list with the row actions, and the delete confirmation that opens from them. */
export function ReleaseActionsMock() {
  const rows = [
    ["#7", "a41c09e2", "production", "published", "Archive"],
    ["#6", "93be71d0", "beta", "archived", "Delete"],
    ["#5", "5d02aa7c", "development", "failed", "Delete"],
  ] as const;
  const tone: Record<string, string> = {
    published: "bg-success/15 text-success",
    archived: "bg-surface-2 text-muted-foreground",
    failed: "bg-danger/15 text-danger",
  };
  return (
    <div className="space-y-4">
      <BrowserFrame url="fireota.creoai.in/releases">
        <p className="mb-2 text-[14px] font-semibold text-foreground">Releases</p>
        <div className="divide-y divide-border rounded-md border border-border">
          {rows.map(([num, id, channel, status, action]) => (
            <div key={num} className="flex items-center gap-2 px-2 py-2">
              <span className="font-mono text-foreground">{num}</span>
              <span className="font-mono text-[10px] text-faint">{id}</span>
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{channel}</span>
              <span className={cn("rounded-full px-1.5 py-px font-mono text-[9px]", tone[status])}>{status}</span>
              <span
                className={cn(
                  "ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium",
                  action === "Delete" ? "bg-danger text-white" : "border border-border text-foreground",
                )}
              >
                {action}
              </span>
            </div>
          ))}
        </div>
      </BrowserFrame>
      <div className="mx-auto max-w-[340px] rounded-xl border border-border bg-background p-4 text-[12px] shadow-lg">
        <p className="text-[14px] font-semibold text-foreground">Delete this update</p>
        <p className="mt-1 text-muted-foreground">The update is deleted and its bundle is removed from your Firebase Storage bucket.</p>
        <div className="mt-3 space-y-1 rounded-md bg-surface-2 p-2 font-mono text-[10px]">
          <p className="flex justify-between"><span className="text-faint">Update</span><span>#6 · 93be71d0</span></p>
          <p className="flex justify-between"><span className="text-faint">Status</span><span>archived</span></p>
        </div>
        <p className="mt-2 text-[11px] text-danger">This cannot be undone.</p>
        <p className="mt-2 text-[11px] text-muted-foreground">Type DELETE to confirm</p>
        <p className="mt-1 rounded-md border border-border px-2 py-1 font-mono text-[11px]">DELETE</p>
        <div className="mt-3 flex justify-end gap-2">
          <span className="rounded-md border border-border px-2.5 py-1 text-[11px]">Cancel</span>
          <span className="rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white">Delete update</span>
        </div>
      </div>
    </div>
  );
}

/** How an expo-updates app talks to FireOTA: manifest from the API, files from your own bucket. */
export function ExpoUpdatesFlowDiagram() {
  const boxes = [
    { icon: "smartphone", title: "Your Expo app", body: "expo-updates checks on launch" },
    { icon: "local_fire_department", title: "FireOTA", body: "picks the update for the channel, runtime and rollout" },
    { icon: "cloud", title: "Your Firebase Storage", body: "serves the bundle and assets" },
  ];
  return (
    <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      {boxes.map((box, i) => (
        <div key={box.title} className="contents">
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <MIcon name={box.icon} className="text-[24px] text-brand" />
            <p className="mt-1 text-[12px] font-semibold text-foreground">{box.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{box.body}</p>
          </div>
          {i < boxes.length - 1 ? (
            <div className="flex flex-col items-center justify-center px-1 text-center font-mono text-[9px] text-faint">
              <MIcon name="sync_alt" className="rotate-90 text-[18px] sm:rotate-0" />
              {i === 0 ? "manifest" : "files"}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ApiKeyMock() {
  const scopes = [
    ["release.read", "Read releases", true],
    ["release.write", "Create releases and upload bundles", true],
    ["release.publish", "Publish, pause and roll back", true],
    ["rollout.write", "Change rollout percentage", false],
  ] as const;
  return (
    <BrowserFrame url="fireota.example.com/settings/api-keys">
      <p className="mb-2 text-[14px] font-semibold text-foreground">Create API key</p>
      <div className="space-y-3">
        <FieldMock label="Name" value="GitHub Actions" />
        <div className="space-y-1.5">
          {scopes.map(([scope, label, on]) => (
            <p key={scope} className="flex items-center gap-2 text-[11px]">
              <MIcon
                name={on ? "check_box" : "check_box_outline_blank"}
                filled={on}
                className={cn("text-[16px]", on ? "text-brand" : "text-faint")}
              />
              <span className="font-mono text-foreground">{scope}</span>
              <span className="text-muted-foreground">— {label}</span>
            </p>
          ))}
        </div>
        <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-foreground">
          <span className="font-mono">fota_sk_live_9f2c…</span> — shown once. Copy it into your CI
          secrets now.
        </div>
        <Btn primary>Create key</Btn>
      </div>
    </BrowserFrame>
  );
}

export function RuntimesMock() {
  return (
    <BrowserFrame url="fireota.example.com/apps/…?tab=runtimes">
      <div className="space-y-2">
        <div className="rounded-md border border-border">
          <p className="flex items-center gap-2 border-b border-border px-2 py-1.5 font-mono text-foreground">
            runtime 1.0.0{" "}
            <span className="rounded-sm bg-brand/15 px-1.5 text-[9px] text-brand">
              current store build
            </span>
          </p>
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            #3 “Fix checkout crash” · android · published · 12 devices
          </p>
        </div>
        <div className="rounded-md border border-border">
          <p className="border-b border-border px-2 py-1.5 font-mono text-foreground">
            runtime 1.0
          </p>
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            No OTA updates for this runtime yet. · 1 device
          </p>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function AnalyticsEventsMock() {
  const events = [
    ["update_check", "app opened, asked for an update", "text-muted-foreground"],
    ["download_started", "update #3 found for runtime 1.0.0", "text-info"],
    ["download_completed", "SHA-256 verified", "text-info"],
    ["install_succeeded", "new bundle reached configure()", "text-success"],
  ];
  return (
    <BrowserFrame url="fireota.example.com/analytics">
      <div className="space-y-1.5">
        {events.map(([name, note, tone]) => (
          <div
            key={name}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
          >
            <MIcon name="fiber_manual_record" filled className={cn("text-[10px]", tone)} />
            <span className="w-36 shrink-0 font-mono text-[11px] text-foreground">{name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{note}</span>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

/* ------------------------------- app mock-ups ------------------------------- */

function AppContent() {
  return (
    <div className="space-y-1.5 px-2.5">
      <p className="text-[11px] font-semibold">My App</p>
      <div className="h-10 rounded bg-neutral-100" />
      <div className="h-6 rounded bg-neutral-100" />
      <div className="h-6 rounded bg-neutral-100" />
      <div className="h-14 rounded bg-neutral-100" />
    </div>
  );
}

/** Mirrors FireOTATheme in @fireota/react-native; the defaults are the SDK's defaultTheme. */
interface PromptTheme {
  accent: string;
  background: string;
  card: string;
  text: string;
  muted: string;
}

const SDK_DEFAULT_THEME: PromptTheme = {
  accent: "#FF5A1F",
  background: "#0E1013",
  card: "#171A1F",
  text: "#F4F5F7",
  muted: "#9AA1AC",
};

const EXAMPLE_CUSTOM_THEME: PromptTheme = {
  accent: "#6D28D9",
  background: "#FFFFFF",
  card: "#F4F1FB",
  text: "#1F1235",
  muted: "#6B6280",
};

function PromptBanner({
  theme,
  title = "Update ready",
  message = "Fix checkout crash",
}: {
  theme: PromptTheme;
  title?: string;
  message?: string;
}) {
  return (
    <div
      className="absolute inset-x-2 bottom-3 flex items-center gap-1.5 rounded-lg p-2 shadow-lg"
      style={{ background: theme.card }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold" style={{ color: theme.text }}>
          {title}
        </p>
        <p className="truncate text-[8px]" style={{ color: theme.muted }}>
          {message}
        </p>
      </div>
      <span className="text-[8px]" style={{ color: theme.muted }}>
        Later
      </span>
      <span
        className="rounded px-1.5 py-0.5 text-[8px] font-medium text-white"
        style={{ background: theme.accent }}
      >
        Restart
      </span>
    </div>
  );
}

function PhoneCaption({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

export function UpdatePromptMocks({ theme = SDK_DEFAULT_THEME }: { theme?: PromptTheme }) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <AppContent />
          <PromptBanner theme={theme} />
        </PhoneFrame>
        <PhoneCaption>Normal update — downloaded</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <div
            className="absolute inset-0 grid place-items-center px-3 text-center"
            style={{ background: theme.background }}
          >
            <div className="space-y-1.5">
              <div
                className="mx-auto size-5 animate-spin rounded-full border-2"
                style={{ borderColor: theme.muted, borderTopColor: theme.accent }}
              />
              <p className="text-[10px] font-semibold" style={{ color: theme.text }}>
                Installing an important update
              </p>
              <p className="text-[8px]" style={{ color: theme.muted }}>
                This only takes a moment.
              </p>
            </div>
          </div>
        </PhoneFrame>
        <PhoneCaption>Mandatory update</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <div
            className="absolute inset-0 space-y-1.5 px-2.5 pt-5"
            style={{ background: theme.background }}
          >
            <p className="text-[11px] font-semibold" style={{ color: theme.text }}>
              App updates
            </p>
            <div className="rounded text-[8px]" style={{ background: theme.card }}>
              {[
                ["App version", "1.0.0"],
                ["Runtime", "1.0.0"],
                ["Channel", "production"],
                ["Running", "update 3f9a12c0"],
                ["Status", "Up to date"],
              ].map(([k, v]) => (
                <p key={k} className="flex justify-between px-1.5 py-1">
                  <span style={{ color: theme.muted }}>{k}</span>
                  <span className="font-mono" style={{ color: theme.text }}>
                    {v}
                  </span>
                </p>
              ))}
            </div>
            <span
              className="block rounded py-1 text-center text-[8px] font-medium text-white"
              style={{ background: theme.accent }}
            >
              Check for updates
            </span>
          </div>
        </PhoneFrame>
        <PhoneCaption>&lt;UpdateScreen /&gt;</PhoneCaption>
      </div>
    </div>
  );
}

/** Default prompt next to the same prompt with a custom theme and custom text. */
export function ThemeCompareMock() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <AppContent />
          <PromptBanner theme={SDK_DEFAULT_THEME} />
        </PhoneFrame>
        <PhoneCaption>Default theme</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <AppContent />
          <PromptBanner theme={EXAMPLE_CUSTOM_THEME} />
        </PhoneFrame>
        <PhoneCaption>theme: accent #6D28D9, light card</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <AppContent />
          <PromptBanner
            theme={EXAMPLE_CUSTOM_THEME}
            title="New version available"
            message="Restart to get the latest fixes."
          />
        </PhoneFrame>
        <PhoneCaption>Custom title and message</PhoneCaption>
      </div>
    </div>
  );
}

/** Examples of prompts built with renderPrompt / useFireOTA: a top bar and a centred dialog. */
export function CustomPromptMock() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <div className="mx-1.5 mb-1.5 flex items-center gap-1.5 rounded-md bg-emerald-600 px-2 py-1.5 text-white">
            <span className="flex-1 text-[8px] font-medium">A new version is ready</span>
            <span className="rounded bg-white px-1.5 py-0.5 text-[8px] font-semibold text-emerald-700">
              Update
            </span>
          </div>
          <AppContent />
        </PhoneFrame>
        <PhoneCaption>Top bar (renderPrompt)</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <PhoneFrame>
          <AppContent />
          <div className="absolute inset-0 grid place-items-center bg-black/45 px-3">
            <div className="w-full space-y-1.5 rounded-xl bg-white p-3 text-center shadow-xl">
              <p className="text-[10px] font-semibold text-neutral-900">What's new</p>
              <p className="text-[8px] text-neutral-500">
                • Faster checkout{"\n"}• Fixed a crash on login
              </p>
              <span className="block rounded-md bg-sky-600 py-1 text-[8px] font-medium text-white">
                Restart now
              </span>
              <span className="block text-[8px] text-neutral-500">Not now</span>
            </div>
          </div>
        </PhoneFrame>
        <PhoneCaption>Dialog with release notes</PhoneCaption>
      </div>
    </div>
  );
}

/* ------------------------- ready-made update screens ------------------------- */
// Each mock mirrors a template in packages/react-native/templates/: same texts, order and colours.

const SAMPLE_NOTES = ["Faster checkout", "Fixed a crash on login", "New dark mode icons"];

function Dimmed() {
  return <div className="absolute inset-0 bg-black/50" />;
}

function SheetScreen({ theme }: { theme: PromptTheme }) {
  return (
    <PhoneFrame>
      <AppContent />
      <Dimmed />
      <div
        className="absolute inset-x-0 bottom-0 space-y-1 rounded-t-2xl px-3 pb-3 pt-2"
        style={{ background: theme.card }}
      >
        <div className="mx-auto mb-1.5 h-[3px] w-7 rounded-full bg-neutral-400/50" />
        <p className="text-[7px] font-extrabold tracking-wider" style={{ color: theme.accent }}>
          NEW UPDATE
        </p>
        <p className="text-[11px] font-extrabold leading-tight" style={{ color: theme.text }}>
          Version 2.4.1 is ready
        </p>
        <p className="text-[7px]" style={{ color: theme.muted }}>
          1.8 MB · downloaded
        </p>
        <div className="space-y-1 py-1.5">
          {SAMPLE_NOTES.map((note) => (
            <p
              key={note}
              className="flex items-center gap-1.5 text-[8px]"
              style={{ color: theme.text }}
            >
              <span className="size-1 shrink-0 rounded-full" style={{ background: theme.accent }} />
              {note}
            </p>
          ))}
        </div>
        <span
          className="block rounded-md py-1.5 text-center text-[8px] font-bold text-white"
          style={{ background: theme.accent }}
        >
          Restart to update
        </span>
        <span
          className="block pt-0.5 text-center text-[8px] font-semibold"
          style={{ color: theme.muted }}
        >
          Later
        </span>
      </div>
    </PhoneFrame>
  );
}

/** UpdateSheet.tsx: default theme next to a light custom theme. */
export function UpdateSheetMock() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <SheetScreen theme={SDK_DEFAULT_THEME} />
        <PhoneCaption>Default theme</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <SheetScreen theme={EXAMPLE_CUSTOM_THEME} />
        <PhoneCaption>With a custom theme</PhoneCaption>
      </div>
    </div>
  );
}

function DialogScreen({ theme }: { theme: PromptTheme }) {
  return (
    <PhoneFrame>
      <AppContent />
      <div className="absolute inset-0 grid place-items-center bg-black/55 px-3">
        <div
          className="w-full space-y-1 rounded-xl p-3 text-center shadow-xl"
          style={{ background: theme.card }}
        >
          <span
            className="mx-auto mb-1 grid size-6 place-items-center rounded-full text-[11px] font-extrabold text-white"
            style={{ background: theme.accent }}
          >
            ↑
          </span>
          <p className="text-[10px] font-extrabold" style={{ color: theme.text }}>
            What's new
          </p>
          <p className="font-mono text-[7px]" style={{ color: theme.muted }}>
            Version 2.4.1
          </p>
          <div className="space-y-0.5 py-1.5 text-left">
            {SAMPLE_NOTES.map((note) => (
              <p key={note} className="text-[8px]" style={{ color: theme.text }}>
                • {note}
              </p>
            ))}
          </div>
          <span
            className="block rounded-md py-1.5 text-[8px] font-bold text-white"
            style={{ background: theme.accent }}
          >
            Restart now
          </span>
          <span className="block pt-0.5 text-[8px] font-semibold" style={{ color: theme.muted }}>
            Not now
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** UpdateDialog.tsx: default theme next to a light custom theme. */
export function UpdateDialogMock() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <DialogScreen theme={SDK_DEFAULT_THEME} />
        <PhoneCaption>Default theme</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <DialogScreen theme={EXAMPLE_CUSTOM_THEME} />
        <PhoneCaption>With a custom theme</PhoneCaption>
      </div>
    </div>
  );
}

function RequiredScreen({ theme, failed = false }: { theme: PromptTheme; failed?: boolean }) {
  return (
    <PhoneFrame>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center"
        style={{ background: theme.background }}
      >
        <span
          className="rounded-full px-2 py-0.5 text-[6px] font-extrabold tracking-wider"
          style={{ background: theme.card, color: theme.accent }}
        >
          REQUIRED UPDATE
        </span>
        <p className="text-[12px] font-extrabold" style={{ color: theme.text }}>
          Updating your app
        </p>
        <p className="text-[8px] leading-snug" style={{ color: theme.muted }}>
          Fixes a payment issue. This only takes a moment.
        </p>
        {failed ? (
          <>
            <p className="pt-1.5 text-[7px]" style={{ color: "#F05252" }}>
              The update could not be downloaded. Check your connection.
            </p>
            <span
              className="rounded-md px-3 py-1 text-[8px] font-bold text-white"
              style={{ background: theme.accent }}
            >
              Try again
            </span>
          </>
        ) : (
          <div className="space-y-1 pt-2">
            <div
              className="mx-auto size-5 animate-spin rounded-full border-2"
              style={{ borderColor: theme.muted, borderTopColor: theme.accent }}
            />
            <p className="text-[7px]" style={{ color: theme.muted }}>
              Downloading…
            </p>
          </div>
        )}
        <p className="absolute bottom-4 font-mono text-[7px]" style={{ color: theme.muted }}>
          Version 2.4.1
        </p>
      </div>
    </PhoneFrame>
  );
}

/** RequiredUpdateScreen.tsx: downloading, and the retry state after a failed download. */
export function RequiredUpdateMock() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <RequiredScreen theme={SDK_DEFAULT_THEME} />
        <PhoneCaption>Downloading</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <RequiredScreen theme={SDK_DEFAULT_THEME} failed />
        <PhoneCaption>Download failed</PhoneCaption>
      </div>
    </div>
  );
}

function SettingsScreen({ theme, available }: { theme: PromptTheme; available: boolean }) {
  return (
    <PhoneFrame>
      <div
        className="absolute inset-0 space-y-1.5 px-2 pt-5"
        style={{ background: theme.background }}
      >
        <p className="px-0.5 text-[11px] font-extrabold" style={{ color: theme.text }}>
          Settings
        </p>
        <div className="space-y-1 rounded-lg p-2" style={{ background: theme.card }}>
          <p
            className="flex items-center justify-between text-[9px] font-extrabold"
            style={{ color: theme.text }}
          >
            App updates
            <span
              className="size-1.5 rounded-full"
              style={{ background: available ? theme.accent : "#22C55E" }}
            />
          </p>
          <p className="text-[8px] font-semibold" style={{ color: theme.text }}>
            {available ? "Update available: 2.4.1" : "You're on the latest version"}
          </p>
          {available ? (
            <p className="text-[7px] leading-snug" style={{ color: theme.muted }}>
              Faster checkout and a fix for a crash on login.
            </p>
          ) : null}
          <div className="border-t pt-0.5" style={{ borderColor: theme.background }}>
            {[
              ["App version", "2.4.0"],
              ["Channel", "production"],
              ["Running", available ? "store build" : "update 3f9a12c0"],
              ["Last checked", "Today, 9:41"],
            ].map(([k, v]) => (
              <p key={k} className="flex justify-between py-[3px] text-[7px]">
                <span style={{ color: theme.muted }}>{k}</span>
                <span className="font-semibold" style={{ color: theme.text }}>
                  {v}
                </span>
              </p>
            ))}
          </div>
          <span
            className="mt-1 block rounded-md py-1.5 text-center text-[8px] font-bold text-white"
            style={{ background: theme.accent }}
          >
            {available ? "Download update" : "Check for updates"}
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** UpdatesSettingsCard.tsx: an update waiting, and up to date. */
export function UpdatesSettingsMock() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div className="space-y-2 text-center">
        <SettingsScreen theme={SDK_DEFAULT_THEME} available />
        <PhoneCaption>Update available</PhoneCaption>
      </div>
      <div className="space-y-2 text-center">
        <SettingsScreen theme={EXAMPLE_CUSTOM_THEME} available={false} />
        <PhoneCaption>Up to date (custom theme)</PhoneCaption>
      </div>
    </div>
  );
}

/** Files that `fireota init` touches, as a small tree. */
export function ProjectTreeMock({
  items,
}: {
  items: { path: string; note: string; changed?: boolean }[];
}) {
  return (
    <div className="mx-auto max-w-[640px] space-y-1 rounded-md border border-border bg-background p-3 font-mono text-[11px]">
      {items.map((it) => (
        <div key={it.path} className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn(it.changed === false ? "text-muted-foreground" : "text-foreground")}>
            <MIcon name="description" className="mr-1 align-[-3px] text-[14px] text-faint" />
            {it.path}
          </span>
          <span className="font-sans text-[11px] text-faint">— {it.note}</span>
        </div>
      ))}
    </div>
  );
}
