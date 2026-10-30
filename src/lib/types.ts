/** Domain models for FireOTA. These mirror the intended backend contract. */

export type Platform = "android" | "ios";

export type Environment = "production" | "beta" | "staging" | "development";

export type ReleaseStatus =
  | "draft"
  | "uploading"
  | "processing"
  | "ready"
  | "published"
  | "paused"
  | "rolled_back"
  | "archived"
  | "failed";

export type ConnectionStatus = "connected" | "degraded" | "expired" | "disconnected";

export type Role = "owner" | "admin" | "release_manager" | "developer" | "viewer";

export type PermissionMode = "allowed" | "denied" | "requires_approval";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  defaultChannel: string;
  requirePublishConfirmation?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  lastActive: string;
  joined: string;
  initials: string;
  customRoleId?: string | null;
  customRoleName?: string | null;
  isYou?: boolean;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  members: number;
}

export interface SecurityEvent {
  id: string;
  kind: string;
  severity: "low" | "medium" | "high";
  title: string;
  details: string;
  actor: string;
  ip: string;
  status: "open" | "resolved";
  at: string;
  ago: string;
}

export interface RuntimeGroup {
  runtimeVersion: string;
  isCurrent: boolean;
  devices: { android: number; ios: number };
  updateCount: number;
  updates: { id: string; label: string; platform: Platform; status: string; message: string; createdAt: string }[];
}

export type StorageProviderType = "s3" | "r2" | "gcs" | "minio" | "azure" | "firebase" | "external";

export interface StorageTargetRecord {
  id: string;
  name: string;
  provider: StorageProviderType;
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  publicCdnUrl: string | null;
  status: "connected" | "permission_error" | "disconnected";
  lastVerifiedAt: string | null;
  appsCount?: number;
  createdAt: string;
}

export interface FirebaseProject {
  id: string;
  name: string;
  firebaseId: string;
  storageBucket: string;
  storage: "enabled" | "disabled";
  apps: number;
  status: ConnectionStatus;
  lastVerified: string;
  googleAccount: string;
  /** `reason` on a failed check says why (e.g. "billing" when Google returns 402). */
  permissions: { label: string; granted: boolean; optional?: boolean; reason?: string }[];
}

export interface AppRecord {
  id: string;
  name: string;
  slug: string;
  platforms: Platform[];
  androidPackage: string;
  iosBundleId: string;
  runtimeVersion: string;
  channels: string[];
  currentRelease: string;
  status: "active" | "paused" | "setup";
  firebaseProjectId: string;
  storageTargetId?: string | null;
  devices: { android: number; ios: number };
  updateRate: { android: number; ios: number };
  codeSigning?: { keyId: string | null; required: boolean };
}

export interface Artifact {
  kind: "bundle" | "assets" | "sourcemap" | "manifest";
  size: string;
  hash: string;
  path: string;
  status: "stored" | "missing" | "processing";
}

export interface ReleaseRecord {
  id: string;
  number: number;
  appId: string;
  appName: string;
  platform: Platform;
  channelId: string;
  channelName: string;
  environment: Environment;
  version: string;
  shortId?: string;
  groupId?: string | null;
  signed?: boolean;
  signatureKeyId?: string | null;
  runtimeVersion: string;
  nativeCompatibility: string;
  status: ReleaseStatus;
  rollout: number;
  mandatory: boolean;
  bundleSize: string;
  compressedSize: string;
  checksum: string;
  notes: string;
  gitCommit: string;
  gitBranch: string;
  buildNumber: string;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  artifacts: Artifact[];
  timeline: { label: string; at: string | null; state: "done" | "active" | "pending" | "failed" }[];
  metrics: {
    totalDevices: number;
    eligibleDevices: number;
    updated: number;
    pending: number;
    failed: number;
    successRate: number;
    adoption: number;
    rollbackRate: number;
  };
}

export interface ChannelRecord {
  id: string;
  name: string;
  environment: Environment;
  description: string;
  appId: string;
  appName: string;
  platform: Platform | "all";
  currentRelease: string;
  rollout: number;
  status: "active" | "paused" | "empty";
  updatedAt: string;
  updatePolicy: string;
  activeReleaseId?: string | null;
  history: { release: string; version: string; at: string; status: ReleaseStatus }[];
}

export interface RolloutRecord {
  id: string;
  appName: string;
  releaseId: string;
  releaseLabel: string;
  channelName: string;
  environment: Environment;
  platform: Platform;
  current: number;
  target: number;
  devices: number;
  adoption: number;
  successRate: number;
  failures: number;
  rollbackThreshold: number;
  status: "active" | "paused" | "completed";
  startedAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  resource: string;
  resourceId: string;
  appName: string;
  result: "success" | "failure";
  ip: string;
  requestId: string;
  before: string;
  after: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix?: string;
  lastUsedIp?: string | null;
  environment: Environment;
  scopes: string[];
  created: string;
  lastUsed: string | null;
  status: "active" | "revoked" | "expired";
  expires: string | null;
}

export interface Webhook {
  id: string;
  endpoint: string;
  events: string[];
  status: "active" | "paused" | "failing";
  lastDelivery: string;
  successRate: number;
  created: string;
  secretSet: boolean;
  deliveries: {
    id: string;
    event: string;
    status: number;
    latency: string;
    at: string;
    attempt: number;
    succeeded?: boolean;
    error?: string | null;
    retry?: string | null;
  }[];
}

export interface Agent {
  id: string;
  key?: string;
  name: string;
  description: string;
  status: "available" | "enabled" | "disabled" | "coming_soon";
  lastExecution: string | null;
  capabilities: string[];
  permissions: { tool: string; mode: PermissionMode }[];
  approvalPolicy: string;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  appName: string;
  releaseLabel: string;
  status: "completed" | "failed" | "awaiting_approval" | "running";
  started: string;
  completed: string | null;
}

export interface AgentApproval {
  id: string;
  agentName: string;
  requestedAction: string;
  appName: string;
  releaseLabel: string;
  channelName: string;
  environment: Environment;
  risk: "low" | "medium" | "high";
  reasoning: string;
  requestedAt: string;
}

export interface ActivityItem {
  id: string;
  kind: "published" | "rolled_back" | "firebase" | "member" | "api_key" | "paused";
  message: string;
  meta: string;
  at: string;
}

export interface DashboardSummary {
  greetingName: string;
  stats: { apps: number; productionReleases: number; activeRollouts: number; successRate: number };
  health: { adoption: number; successful: number; failed: number; rollbacks: number; rollbackRefs: string };
  firebase: { name: string; status: ConnectionStatus; storage: boolean; permissions: boolean };
}

export interface AnalyticsSummary {
  updateChecks: number;
  updatesAvailable: number;
  downloads: number;
  successfulInstalls: number;
  failedInstalls: number;
  rollbacks: number;
  adoption: number;
  adoptionSeries: { day: string; adoption: number; failures: number }[];
  versionDistribution: { version: string; devices: number }[];
  platformDistribution: { platform: string; devices: number }[];
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  tone: "success" | "warning" | "danger" | "info";
  kind?: string;
  link?: string | null;
  at: string;
  read: boolean;
}
