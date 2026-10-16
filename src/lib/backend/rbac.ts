/**
 * Role based access control. Enforced server-side; the UI may mirror it for UX only.
 */

export type OrgRole = "owner" | "admin" | "release_manager" | "developer" | "viewer" | "agent";

export type Permission =
  | "project.read"
  | "project.connect"
  | "project.disconnect"
  | "project.delete"
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
  | "security.read"
  | "security.manage"
  | "org.update"
  | "org.delete";

/** Every permission, in display order. Custom roles pick from this list. */
export const ALL_PERMISSIONS: Permission[] = [
  "project.read",
  "project.connect",
  "project.disconnect",
  "project.delete",
  "app.read",
  "app.create",
  "app.update",
  "app.delete",
  "release.read",
  "release.create",
  "release.upload",
  "release.publish",
  "release.pause",
  "release.rollback",
  "release.archive",
  "release.delete",
  "channel.read",
  "channel.create",
  "channel.update",
  "channel.delete",
  "rollout.read",
  "rollout.update",
  "analytics.read",
  "team.read",
  "team.manage",
  "audit.read",
  "api_key.read",
  "api_key.create",
  "api_key.revoke",
  "webhook.read",
  "webhook.create",
  "webhook.update",
  "webhook.delete",
  "agent.read",
  "agent.execute",
  "agent.manage",
  "security.read",
  "security.manage",
  "org.update",
];

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

const DEVELOPER: Permission[] = [...READ_ONLY, "release.create", "release.upload", "webhook.read"];

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
  "security.read",
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
  "project.disconnect",
  "project.delete",
  "api_key.read",
  "security.manage",
  "org.update",
];

const OWNER: Permission[] = [...ADMIN, "org.delete"];

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

/**
 * Effective permissions of a member: a custom role replaces the built-in role's list,
 * except for owners, who always keep everything. Unknown names are dropped.
 */
export function effectivePermissions(role: OrgRole, custom: string[] | null | undefined): Permission[] {
  if (role === "owner" || !custom) return ROLE_PERMISSIONS[role];
  return ALL_PERMISSIONS.filter((p) => custom.includes(p));
}

export const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  "project.connect": "Connect Firebase projects",
  "project.disconnect": "Disconnect Firebase projects",
  "project.delete": "Remove Firebase projects",
  "app.create": "Create applications",
  "app.update": "Edit applications & code signing",
  "app.delete": "Delete applications",
  "release.create": "Create releases",
  "release.upload": "Upload bundles",
  "release.publish": "Publish releases",
  "release.pause": "Pause rollouts",
  "release.rollback": "Roll back releases",
  "release.archive": "Archive releases",
  "release.delete": "Delete releases",
  "channel.create": "Create channels",
  "channel.update": "Edit channels",
  "channel.delete": "Delete channels",
  "rollout.update": "Change rollout %",
  "team.manage": "Manage members & roles",
  "audit.read": "Read audit log",
  "api_key.read": "View API keys",
  "api_key.create": "Create API keys",
  "api_key.revoke": "Revoke & delete API keys",
  "webhook.create": "Create webhooks",
  "webhook.update": "Edit & test webhooks",
  "webhook.delete": "Delete webhooks",
  "agent.execute": "Run agents",
  "agent.manage": "Configure agents & AI key",
  "security.read": "View security alerts",
  "security.manage": "Resolve security alerts",
  "org.update": "Edit workspace settings",
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  release_manager: "Release manager",
  developer: "Developer",
  viewer: "Viewer",
  agent: "Agent",
};
