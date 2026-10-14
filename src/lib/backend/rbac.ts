/**
 * Role based access control. Enforced server-side; the UI may mirror it for UX only.
 */

export type OrgRole = "owner" | "admin" | "release_manager" | "developer" | "viewer" | "agent";

export type Permission =
  | "project.read"
  | "project.connect"
  | "project.disconnect"
  | "app.read"
  | "app.create"
  | "app.update"
  | "app.delete"
  | "release.read"
  | "release.create"
  | "release.upload"
  | "release.publish"
  | "release.pause"
  | "release.rollback"
  | "release.archive"
  | "release.delete"
  | "channel.read"
  | "channel.create"
  | "channel.update"
  | "channel.delete"
  | "rollout.read"
  | "rollout.update"
  | "analytics.read"
  | "team.read"
  | "team.manage"
  | "audit.read"
  | "api_key.read"
  | "api_key.create"
  | "api_key.revoke"
  | "webhook.read"
  | "webhook.create"
  | "webhook.update"
  | "webhook.delete"
  | "agent.read"
  | "agent.execute"
  | "agent.manage"
  | "org.update"
  | "org.delete";

const READ_ONLY: Permission[] = [
  "project.read",
  "app.read",
  "release.read",
  "channel.read",
  "rollout.read",
  "analytics.read",
  "team.read",
  "agent.read",
];

const DEVELOPER: Permission[] = [...READ_ONLY, "release.create", "release.upload", "api_key.read", "webhook.read"];

const RELEASE_MANAGER: Permission[] = [
  ...DEVELOPER,
  "release.publish",
  "release.pause",
  "release.rollback",
  "release.archive",
  "rollout.update",
  "channel.create",
  "channel.update",
  "audit.read",
  "agent.execute",
];

const ADMIN: Permission[] = [
  ...RELEASE_MANAGER,
  "app.create",
  "app.update",
  "app.delete",
  "release.delete",
  "channel.delete",
  "team.manage",
  "api_key.create",
  "api_key.revoke",
  "webhook.create",
  "webhook.update",
  "webhook.delete",
  "agent.manage",
  "project.connect",
];

const OWNER: Permission[] = [...ADMIN, "project.disconnect", "org.update", "org.delete"];

/** An agent identity gets read + explicitly granted tool execution, never destructive defaults. */
const AGENT: Permission[] = [...READ_ONLY, "agent.execute"];

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  owner: OWNER,
  admin: ADMIN,
  release_manager: RELEASE_MANAGER,
  developer: DEVELOPER,
  viewer: READ_ONLY,
  agent: AGENT,
};

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  release_manager: "Release manager",
  developer: "Developer",
  viewer: "Viewer",
  agent: "Agent",
};
