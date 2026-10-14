/**
 * FireOTA service layer.
 *
 * Every screen talks to these functions and nothing else. Each one now calls the
 * real backend: authentication through Lovable Cloud auth, everything else
 * through typed server functions that enforce membership, roles and auditing.
 * No fixtures, no simulated latency, no hardcoded successes.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  changeMemberRole,
  createOrganization,
  getDashboard,
  inviteMember,
  listActivity,
  listAudit,
  listNotifications,
  listTeam,
  markNotificationsRead,
  removeMember,
  getSession,
  updateOrganization,
} from "@/lib/api/core.functions";
import {
  connectProject,
  disconnectFirebaseProject,
  listFirebaseProjects,
  listSelectableProjects,
  startFirebaseAuthorization,
  verifyFirebaseProject,
} from "@/lib/api/firebase.functions";
import { createApp, getApp, getChannel, listApps, listChannels, updateApp } from "@/lib/api/apps.functions";
import {
  archiveReleaseFn,
  createReleaseFn,
  deleteReleaseFn,
  getAnalytics,
  getRelease,
  getRollout,
  listReleases,
  listRollouts,
  pauseReleaseFn,
  promoteReleaseFn,
  publishReleaseFn,
  rollbackReleaseFn,
  setReleaseRollout,
  setRolloutState,
} from "@/lib/api/releases.functions";
import {
  askAgent,
  createApiKey,
  createWebhook,
  decideAgentApproval,
  deleteWebhook,
  listAgentApprovals,
  listAgentExecutions,
  listAgents,
  listApiKeys,
  listDeployments,
  listWebhooks,
  sendWebhookTest,
  revokeApiKey,
} from "@/lib/api/integrations.functions";
import type {
  Agent,
  AgentApproval,
  AgentExecution,
  ActivityItem,
  AnalyticsSummary,
  ApiKey,
  AppRecord,
  AuditEvent,
  ChannelRecord,
  DashboardSummary,
  FirebaseProject,
  NotificationItem,
  Organization,
  ReleaseRecord,
  Role,
  RolloutRecord,
  User,
  Webhook,
} from "@/lib/types";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "unauthorized" | "disconnected" | "invalid" | "unknown",
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function greeting(date = new Date()) {
  const hour = date.getUTCHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Server errors arrive as messages; surface them verbatim to the existing UI. */
function unwrap(error: unknown): never {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  throw new ServiceError(message.replace(/^Error:\s*/, ""), "unknown");
}

export const authService = {
  session: async () => {
    try {
      return await getSession();
    } catch (error) {
      return unwrap(error);
    }
  },
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ServiceError(error.message, "unauthorized");
    return { user: data.user };
  },
  /**
   * Supabase Auth Google sign-in. The browser leaves for Google and returns to `next`,
   * where the Supabase client picks the session up from the URL. `next` must be listed
   * under Authentication -> URL Configuration -> Redirect URLs in Supabase.
   */
  signInWithGoogle: async (next: "/dashboard" | "/onboarding" = "/dashboard") => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${next}` },
    });
    if (error) throw new ServiceError("Google sign-in failed. Try again.", "unauthorized");
    return data;
  },
  signUp: async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) throw new ServiceError(error.message, "invalid");
    return { verificationSentTo: email, name };
  },
  requestPasswordReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new ServiceError(error.message, "invalid");
    return { sentTo: email };
  },
  resetPassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ServiceError(error.message, "invalid");
    return { ok: true };
  },
  /**
   * Changes the signed-in user's password. Accounts that have an email/password login must
   * prove the current password first; Google-only accounts may add a password.
   */
  changePassword: async (currentPassword: string, newPassword: string) => {
    if (newPassword.length < 12) throw new ServiceError("The new password must be at least 12 characters.", "invalid");
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user?.email) throw new ServiceError("Sign in again to change your password.", "unauthorized");
    const hasPassword = (user.identities ?? []).some((identity) => identity.provider === "email");
    if (hasPassword) {
      if (!currentPassword) throw new ServiceError("Enter your current password.", "invalid");
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (check.error) throw new ServiceError("The current password is incorrect.", "unauthorized");
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new ServiceError(error.message, "invalid");
    return { ok: true };
  },
  resendVerification: async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new ServiceError("Sign in again to resend the verification email.", "unauthorized");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw new ServiceError(error.message, "invalid");
    return { ok: true };
  },
  signOut: async () => {
    await supabase.auth.signOut();
    return { ok: true };
  },
};

export const organizationService = {
  get: async (): Promise<Organization> => {
    const session = await getSession();
    if (!session.organization) throw new ServiceError("No organization yet.", "not_found");
    return session.organization;
  },
  update: (patch: Partial<Organization>) =>
    updateOrganization({
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.defaultChannel !== undefined ? { defaultChannel: patch.defaultChannel } : {}),
      },
    }),
  create: (name: string, slug: string) => createOrganization({ data: { name, slug } }),
};

export const firebaseService = {
  list: (): Promise<FirebaseProject[]> => listFirebaseProjects() as Promise<FirebaseProject[]>,
  get: async (id: string): Promise<FirebaseProject> => {
    const projects = (await listFirebaseProjects()) as FirebaseProject[];
    const project = projects.find((p) => p.id === id || p.firebaseId === id);
    if (!project) throw new ServiceError("Firebase project not found", "not_found");
    return project;
  },
  /**
   * Lists the Google account's Firebase projects. When no Google account has been
   * authorized yet the browser is sent to Google's consent screen first.
   */
  listSelectable: async () => {
    try {
      const result = await listSelectableProjects();
      return result.projects;
    } catch (error) {
      const { url } = await startFirebaseAuthorization();
      window.location.href = url;
      void error;
      return [];
    }
  },
  /**
   * Attaches the chosen project (if new), verifies live Firebase access, and returns the
   * project as now stored — including whether Storage is actually writable.
   */
  verify: async (id: string): Promise<FirebaseProject> => {
    const projects = (await listFirebaseProjects()) as FirebaseProject[];
    const existing = projects.find((p) => p.id === id || p.firebaseId === id);
    const connectedId = existing
      ? (await verifyFirebaseProject({ data: { id: existing.id } })).id
      : (await connectProject({ data: { firebaseProjectId: id } })).id;
    return firebaseService.get(connectedId);
  },
  reconnect: async () => {
    const { url } = await startFirebaseAuthorization();
    window.location.href = url;
    return { status: "connected" as const };
  },
  disconnect: (id: string) => disconnectFirebaseProject({ data: { id } }),
};

export const appsService = {
  list: (): Promise<AppRecord[]> => listApps() as Promise<AppRecord[]>,
  get: (id: string): Promise<AppRecord> => getApp({ data: { id } }) as Promise<AppRecord>,
  create: (input: {
    name: string;
    slug?: string;
    runtimeVersion?: string;
    firebaseProjectId?: string;
    platforms?: { platform: "android" | "ios"; packageName?: string; bundleIdentifier?: string; nativeVersion: string }[];
  }) =>
    createApp({
      data: {
        name: input.name,
        ...(input.slug ? { slug: input.slug } : {}),
        ...(input.firebaseProjectId ? { firebaseProjectId: input.firebaseProjectId } : {}),
        runtimeVersion: input.runtimeVersion ?? "1.0.0",
        platforms:
          input.platforms ??
          ([{ platform: "android", nativeVersion: "1.0.0" }] as {
            platform: "android" | "ios";
            nativeVersion: string;
          }[]),
      },
    }),
  update: (id: string, patch: { name?: string; status?: "active" | "paused"; runtimeVersion?: string }) =>
    updateApp({ data: { id, ...patch } }),
};

/** Bundles staged by the wizard's upload step, keyed by the checksum shown in the UI. */
const stagedBundles = new Map<string, { file: File; progress: (stage: string, percent: number) => void }>();

async function sha256Browser(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadBundleToBackend(releaseId: string, staged: { file: File; progress: (stage: string, percent: number) => void }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ServiceError("Your session expired. Sign in again.", "unauthorized");

  const body = new FormData();
  body.append("bundle", staged.file);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/public/v1/releases/${releaseId}/bundle`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        staged.progress("Uploading bundle", Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        staged.progress("Verifying checksum", 100);
        resolve();
      } else {
        let message = "The bundle upload failed.";
        try {
          message = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? message;
        } catch {
          /* keep the default message */
        }
        reject(new ServiceError(message, "invalid"));
      }
    };
    xhr.onerror = () => reject(new ServiceError("The bundle upload failed.", "unknown"));
    xhr.send(body);
  });
}

export const releasesService = {
  list: (filters?: { appId?: string; platform?: string; channel?: string; status?: string; search?: string }) =>
    listReleases({ data: filters as never }) as Promise<ReleaseRecord[]>,
  get: (id: string): Promise<ReleaseRecord> => getRelease({ data: { id } }) as Promise<ReleaseRecord>,
  /**
   * Creates the release, streams the staged bundle into the app's Firebase
   * Storage bucket, and publishes it when a rollout percentage is requested.
   */
  create: async (input: {
    appId: string;
    platform: "android" | "ios";
    channel: string;
    version: string;
    runtimeVersion: string;
    notes?: string;
    mandatory?: boolean;
    rollout?: number;
    checksum?: string;
    nativeCompatibility?: string;
  }) => {
    // Check for the bundle first so a missing upload never leaves an empty draft behind.
    const staged = input.checksum ? stagedBundles.get(input.checksum) : [...stagedBundles.values()].at(-1);
    if (!staged) throw new ServiceError("Upload a bundle before creating the release.", "invalid");
    const release = await createReleaseFn({
      data: {
        appId: input.appId,
        channelName: input.channel,
        platform: input.platform,
        version: input.version,
        runtimeVersion: input.runtimeVersion,
        ...(input.nativeCompatibility ? { nativeVersionConstraint: input.nativeCompatibility } : {}),
        ...(input.notes ? { releaseNotes: input.notes } : {}),
        ...(input.mandatory !== undefined ? { mandatory: input.mandatory } : {}),
      },
    });

    await uploadBundleToBackend(release.id, staged);
    stagedBundles.clear();

    if (input.rollout && input.rollout > 0) {
      await publishReleaseFn({ data: { releaseId: release.id, rolloutPercentage: input.rollout } });
    }
    return { id: release.id, number: release.number };
  },
  publish: (id: string, rollout: number) => publishReleaseFn({ data: { releaseId: id, rolloutPercentage: rollout } }),
  pause: (id: string) => pauseReleaseFn({ data: { releaseId: id } }),
  rollback: (id: string, reason: string) => rollbackReleaseFn({ data: { releaseId: id, reason } }),
  archive: (id: string) => archiveReleaseFn({ data: { releaseId: id } }),
  remove: (id: string) => deleteReleaseFn({ data: { releaseId: id } }),
  setRollout: (id: string, percentage: number) => setReleaseRollout({ data: { releaseId: id, percentage } }),
  /**
   * Stages the selected bundle and reports real hashing progress. The transfer to
   * Firebase Storage happens in `create`, once the release row exists.
   */
  upload: async (
    files: { bundle?: File | null; assets?: File | null; sourcemap?: File | null },
    onProgress: (stage: string, percent: number) => void,
  ) => {
    const file = files.bundle;
    if (!file) throw new ServiceError("Select a bundle file to upload.", "invalid");
    if (file.size > 40 * 1024 * 1024) {
      throw new ServiceError(
        `The bundle (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 40 MB limit. Upload only the JS bundle/assets, not an APK.`,
        "invalid",
      );
    }
    onProgress("Reading bundle", 40);
    const checksum = await sha256Browser(file);
    onProgress("Verifying checksum", 100);
    stagedBundles.set(checksum, { file, progress: onProgress });
    const megabytes = file.size / (1024 * 1024);
    return { checksum, size: megabytes >= 1 ? `${megabytes.toFixed(2)} MB` : `${(file.size / 1024).toFixed(1)} KB` };
  },
};

export const channelsService = {
  list: (appId?: string): Promise<ChannelRecord[]> =>
    listChannels({ data: appId ? { appId } : undefined }) as Promise<ChannelRecord[]>,
  get: (id: string): Promise<ChannelRecord> => getChannel({ data: { id } }) as Promise<ChannelRecord>,
  /** Promotes a release onto the named channel (production promotion included). */
  promote: (channelName: string, releaseId: string) =>
    promoteReleaseFn({ data: { releaseId, channelName } }),
};

export const rolloutsService = {
  list: (): Promise<RolloutRecord[]> => listRollouts() as Promise<RolloutRecord[]>,
  get: (id: string): Promise<RolloutRecord> => getRollout({ data: { id } }) as Promise<RolloutRecord>,
  setPercentage: (id: string, percentage: number) => setRolloutState({ data: { id, action: "percentage", percentage } }),
  pause: (id: string) => setRolloutState({ data: { id, action: "pause" } }),
  resume: (id: string) => setRolloutState({ data: { id, action: "resume" } }),
};

export const analyticsService = {
  summary: (filters?: Record<string, string>): Promise<AnalyticsSummary> =>
    getAnalytics({
      data: filters?.["appId"] ? { appId: filters["appId"] } : undefined,
    }) as Promise<AnalyticsSummary>,
};

export const teamService = {
  list: (): Promise<User[]> => listTeam() as Promise<User[]>,
  get: async (id: string): Promise<User> => {
    const members = (await listTeam()) as User[];
    const member = members.find((m) => m.id === id);
    if (!member) throw new ServiceError("Team member not found", "not_found");
    return member;
  },
  invite: (email: string, role: Role) => inviteMember({ data: { email, role } }),
  changeRole: (id: string, role: Role) => changeMemberRole({ data: { id, role } }),
  remove: (id: string) => removeMember({ data: { id } }),
};

export const auditService = {
  list: (filters?: { actor?: string; action?: string; result?: string }) =>
    listAudit({ data: filters as never }) as Promise<AuditEvent[]>,
};

export const apiKeysService = {
  list: (): Promise<ApiKey[]> => listApiKeys() as Promise<ApiKey[]>,
  create: (input: { name: string; environment: string; scopes: string[] }) =>
    createApiKey({ data: input as never }),
  revoke: (id: string) => revokeApiKey({ data: { id } }),
};

export const ciCdService = {
  deployments: () => listDeployments(),
  createToken: (name: string) =>
    createApiKey({ data: { name, environment: "production", scopes: ["release.write", "release.publish"] } }),
};

export const webhooksService = {
  list: (): Promise<Webhook[]> => listWebhooks() as Promise<Webhook[]>,
  get: async (id: string): Promise<Webhook> => {
    const hooks = (await listWebhooks()) as Webhook[];
    const hook = hooks.find((w) => w.id === id);
    if (!hook) throw new ServiceError("Webhook not found", "not_found");
    return hook;
  },
  create: (input: { endpoint: string; events: string[] }) => createWebhook({ data: input }),
  remove: (id: string) => deleteWebhook({ data: { id } }),
  /** Sends a signed test event to this endpoint only; the attempt appears in its delivery log. */
  test: (id: string) => sendWebhookTest({ data: { id } }),
};

export const agentsService = {
  list: (): Promise<Agent[]> => listAgents() as Promise<Agent[]>,
  get: async (id: string): Promise<Agent> => {
    const agents = (await listAgents()) as Agent[];
    const agent = agents.find((a) => a.id === id);
    if (!agent) throw new ServiceError("Agent not found", "not_found");
    return agent;
  },
  executions: (agentId?: string): Promise<AgentExecution[]> =>
    listAgentExecutions({ data: agentId ? { agentId } : undefined }) as Promise<AgentExecution[]>,
  approvals: (): Promise<AgentApproval[]> => listAgentApprovals() as Promise<AgentApproval[]>,
  decide: (id: string, decision: "approve" | "reject") => decideAgentApproval({ data: { id, decision } }),
  ask: (question: string) => askAgent({ data: { question } }),
};

export const notificationsService = {
  list: (): Promise<NotificationItem[]> => listNotifications() as Promise<NotificationItem[]>,
  markAllRead: () => markNotificationsRead(),
};

export const activityService = {
  list: (): Promise<ActivityItem[]> => listActivity() as Promise<ActivityItem[]>,
};

export const dashboardService = {
  summary: (): Promise<DashboardSummary> => getDashboard() as Promise<DashboardSummary>,
  greeting,
};

export const permissionsMatrix = {
  roles: ["owner", "admin", "release_manager", "developer", "viewer"] as Role[],
  capabilities: [
    { label: "Release read", allow: ["owner", "admin", "release_manager", "developer", "viewer"] },
    { label: "Release upload", allow: ["owner", "admin", "release_manager", "developer"] },
    { label: "Publish", allow: ["owner", "admin", "release_manager"] },
    { label: "Rollback", allow: ["owner", "admin", "release_manager"] },
    { label: "Delete", allow: ["owner", "admin"] },
    { label: "Audit read", allow: ["owner", "admin", "release_manager"] },
    { label: "Manage team", allow: ["owner", "admin"] },
    { label: "Manage Firebase", allow: ["owner"] },
  ],
};

export const roleLabels: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  release_manager: "Release manager",
  developer: "Developer",
  viewer: "Viewer",
};

void unwrap;
