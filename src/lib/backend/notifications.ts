/**
 * Turns audited activity into in-app notifications. Pure, so it is unit tested.
 * Every audited action produces one notification; `kind` drives per-member preferences.
 */

export type NotificationKind =
  "release" | "rollout" | "failure" | "team" | "security" | "integration" | "activity";
export type NotificationTone = "success" | "warning" | "danger" | "info";

export interface NotificationDraft {
  title: string;
  body: string;
  tone: NotificationTone;
  kind: NotificationKind;
  link: string | null;
}

/** Preference toggles a member can switch off. Missing keys default to on. */
export const NOTIFICATION_PREFS: { key: NotificationKind; label: string; hint: string }[] = [
  {
    key: "release",
    label: "Releases",
    hint: "Created, uploaded, published, promoted, archived or deleted.",
  },
  { key: "rollout", label: "Rollouts", hint: "Rollout percentage changes and pauses." },
  {
    key: "failure",
    label: "Failures and rollbacks",
    hint: "Rollbacks, failed uploads and automatic pauses.",
  },
  { key: "team", label: "Team", hint: "Invitations, role changes and removals." },
  {
    key: "security",
    label: "Security alerts",
    hint: "Suspicious or risky activity detected in the workspace.",
  },
  {
    key: "integration",
    label: "Integrations",
    hint: "API keys, webhooks, Firebase, channels and agents.",
  },
  { key: "activity", label: "Other activity", hint: "Everything else recorded in the audit log." },
];

export function prefEnabled(prefs: Record<string, unknown> | null | undefined, kind: string) {
  return prefs?.[kind] !== false;
}

const words = (action: string) => action.replace(/[._]/g, " ");

function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function notificationFor(entry: {
  action: string;
  actorLabel: string;
  resourceType: string;
  resourceId?: string | null;
  appName?: string;
  result?: "success" | "failure";
  after?: unknown;
}): NotificationDraft {
  const after = (entry.after && typeof entry.after === "object" ? entry.after : {}) as Record<
    string,
    unknown
  >;
  const who = entry.actorLabel || "Someone";
  const app = entry.appName ? ` in ${entry.appName}` : "";
  const releaseLink =
    entry.resourceType === "release" && entry.resourceId ? `/releases/${entry.resourceId}` : null;
  const draft = (
    title: string,
    body: string,
    tone: NotificationTone,
    kind: NotificationKind,
    link: string | null = null,
  ) => ({
    title,
    body,
    tone,
    kind,
    link,
  });

  if (entry.result === "failure") {
    return draft(
      `Failed: ${words(entry.action)}`,
      `${who}${app}`,
      "danger",
      "failure",
      releaseLink,
    );
  }

  switch (entry.action) {
    case "release.created":
      return draft(
        "New update created",
        `${who} created update #${str(after["number"])}${app}.`,
        "info",
        "release",
        releaseLink,
      );
    case "release.uploaded":
      return draft(
        "Update bundle uploaded",
        `${who} uploaded and verified a bundle${app}.`,
        "info",
        "release",
        releaseLink,
      );
    case "release.published":
      return draft(
        "Update published",
        `${who} published to ${str(after["channel"])} (${str(after["platform"])}) at ${str(after["rollout"])}%${app}.`,
        "success",
        "release",
        releaseLink,
      );
    case "release.promoted":
      return draft(
        "Update promoted",
        `${who} promoted an update to ${str(after["channel"])}${app}.`,
        "success",
        "release",
        releaseLink,
      );
    case "release.paused":
      return draft(
        "Rollout paused",
        `${who} paused a rollout${app}.`,
        "warning",
        "rollout",
        releaseLink,
      );
    case "rollout.updated":
      return draft(
        "Rollout changed",
        `${who} set the rollout to ${str(after["rollout"])}%${app}.`,
        "info",
        "rollout",
        releaseLink,
      );
    case "release.rolled_back":
      return draft(
        "Update rolled back",
        `${who}: ${str(after["reason"]) || "no reason given"}`,
        "danger",
        "failure",
        releaseLink,
      );
    case "release.archived":
      return draft(
        "Update archived",
        `${who} archived an update${app}.`,
        "info",
        "release",
        releaseLink,
      );
    case "release.deleted":
      return draft("Update deleted", `${who} deleted an update${app}.`, "warning", "release");
    case "release.downgrade_published":
      return draft(
        "Older update republished",
        `${who} republished an older update${app}.`,
        "warning",
        "release",
        releaseLink,
      );
    case "team.invited":
      return draft(
        "Member invited",
        `${who} invited ${str(after["email"])} as ${str(after["role"])}.`,
        "info",
        "team",
        "/team",
      );
    case "team.role_changed":
      return draft(
        "Role changed",
        `${who} changed a member's role to ${str(after["role"])}.`,
        "info",
        "team",
        "/team",
      );
    case "team.removed":
      return draft(
        "Member removed",
        `${who} removed a member from the workspace.`,
        "warning",
        "team",
        "/team",
      );
    case "team.suspended":
      return draft("Member suspended", `${who} suspended a member.`, "warning", "team", "/team");
    case "team.reactivated":
      return draft("Member reactivated", `${who} reactivated a member.`, "info", "team", "/team");
    case "role.created":
    case "role.updated":
    case "role.deleted":
      return draft(
        `Custom role ${entry.action.split(".")[1]}`,
        `${who}: ${str(after["name"])}`,
        "info",
        "team",
        "/team",
      );
    case "api_key.created":
      return draft(
        "API key created",
        `${who} created the key "${str(after["name"])}".`,
        "info",
        "integration",
        "/settings/api-keys",
      );
    case "api_key.revoked":
      return draft(
        "API key revoked",
        `${who} revoked an API key.`,
        "warning",
        "integration",
        "/settings/api-keys",
      );
    case "api_key.deleted":
      return draft(
        "API key deleted",
        `${who} deleted an API key.`,
        "warning",
        "integration",
        "/settings/api-keys",
      );
    case "webhook.created":
    case "webhook.updated":
    case "webhook.deleted":
      return draft(
        `Webhook ${entry.action.split(".")[1]}`,
        `${who}: ${str(after["endpoint"])}`,
        "info",
        "integration",
        "/settings/webhooks",
      );
    case "firebase.project_connected":
      return draft(
        "Firebase project connected",
        `${who} connected ${str(after["displayName"]) || "a project"}.`,
        "success",
        "integration",
        "/projects",
      );
    case "firebase.disconnected":
    case "firebase.removed":
      return draft(
        "Firebase project removed",
        `${who} ${words(entry.action.split(".")[1] ?? "")} a Firebase project.`,
        "warning",
        "integration",
        "/projects",
      );
    case "app.created":
      return draft(
        "Application added",
        `${who} added ${entry.appName || "an application"}.`,
        "success",
        "activity",
        "/apps",
      );
    case "app.deleted":
      return draft(
        "Application deleted",
        `${who} deleted ${entry.appName || "an application"}.`,
        "danger",
        "activity",
        "/apps",
      );
    case "app.signing_updated":
      return draft(
        "Code signing changed",
        `${who} changed code signing${app}.`,
        "warning",
        "security",
        "/apps",
      );
    case "channel.created":
    case "channel.updated":
    case "channel.deleted":
      return draft(
        `Channel ${entry.action.split(".")[1]}`,
        `${who}: ${str(after["name"])}${app}`,
        "info",
        "integration",
        "/channels",
      );
    case "agent.settings_updated":
      return draft(
        "Agent AI settings changed",
        `${who} updated the agent provider key.`,
        "warning",
        "integration",
        "/agents",
      );
    case "agent.approval_requested":
      return draft(
        "Agent needs approval",
        `An agent asked to ${str(after["action"])}.`,
        "warning",
        "integration",
        "/agents",
      );
    case "agent.approval_approved":
    case "agent.approval_rejected":
      return draft(
        `Agent request ${entry.action.endsWith("approved") ? "approved" : "rejected"}`,
        who,
        "info",
        "integration",
        "/agents",
      );
    case "organization.updated":
      return draft(
        "Workspace settings changed",
        `${who} updated the workspace.`,
        "info",
        "activity",
        "/settings",
      );
    default:
      return draft(
        words(entry.action).replace(/^./, (c) => c.toUpperCase()),
        `${who}${app}`,
        "info",
        "activity",
        releaseLink,
      );
  }
}
