/**
 * FireOTA service layer.
 *
 * Every screen talks to these functions and nothing else. Each one now calls the
 * real backend: authentication through Lovable Cloud auth, everything else
 * through typed server functions that enforce membership, roles and auditing.
 * No fixtures, no simulated latency, no hardcoded successes.
 */
import { friendlyError } from "@/lib/friendly-error";
import { supabase } from "@/integrations/supabase/client";
import {
  changeMemberRole,
  createOrganization,
  deleteOrganization,
  deleteRole,
  getDashboard,
  getNotificationPrefs,
  inviteMember,
  listActivity,
  listAudit,
  listNotifications,
  listRoles,
  listSecurityEvents,
  listTeam,
  markNotificationsRead,
  removeMember,
  resendInvite,
  resolveSecurityEvent,
  saveRole,
  setMemberStatus,
  getSession,
  updateNotificationPrefs,
  updateOrganization,
} from "@/lib/api/core.functions";
import {
  connectProject,
  disconnectFirebaseProject,
  listFirebaseProjects,
  listSelectableProjects,
  removeFirebaseProject,
  startFirebaseAuthorization,
  verifyFirebaseProject,
} from "@/lib/api/firebase.functions";
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  saveConversation,
} from "@/lib/api/conversations.functions";
import {
  createApp,
  createChannel,
  deleteApp,
  deleteChannel,
  getApp,
  getChannel,
  listApps,
  listChannels,
  listRuntimes,
  setAppSigning,
  updateApp,
  updateChannel,
} from "@/lib/api/apps.functions";
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
  resumeReleaseFn,
  rollbackReleaseFn,
  setReleaseRollout,
  setRolloutState,
} from "@/lib/api/releases.functions";
import {
  askAgent,
  createApiKey,
  createWebhook,
  decideAgentApproval,
  deleteApiKey,
  deleteWebhook,
  getAgentSettings,
  listAgentApprovals,
  listAgentExecutions,
  listAgents,
  listApiKeys,
  listDeployments,
  listWebhooks,
  removeAgentSettings,
  runAgentFn,
  saveAgentSettings,
  sendWebhookTest,
  revokeApiKey,
  setAgentEnabled,
  setAgentToolMode,
  updateWebhook,
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
  CustomRole,
  DashboardSummary,
  FirebaseProject,
  NotificationItem,
  Organization,
  ReleaseRecord,
  Role,
  RolloutRecord,
  RuntimeGroup,
  SecurityEvent,
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

let googleRedirectStarted = false;

/** Server errors arrive as messages; surface them verbatim to the existing UI. */
function unwrap(error: unknown): never {
  const message = friendlyError(error, "Something went wrong.");
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
    void data;
    // The browser is leaving for Google; stay pending so the button keeps its loader.
    return await new Promise<never>(() => {});
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
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.defaultChannel !== undefined ? { defaultChannel: patch.defaultChannel } : {}),
        ...(patch.requirePublishConfirmation !== undefined ? { requirePublishConfirmation: patch.requirePublishConfirmation } : {}),
      },
    }),
  create: (name: string, slug: string) => createOrganization({ data: { name, slug } }),
  remove: (confirmSlug: string) => deleteOrganization({ data: { confirmSlug } }),
};

export const securityService = {
  list: (status: "open" | "resolved" | "all" = "open"): Promise<SecurityEvent[]> =>
    listSecurityEvents({ data: { status } }) as Promise<SecurityEvent[]>,
  setStatus: (id: string, status: "open" | "resolved") => resolveSecurityEvent({ data: { id, status } }),
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
      // Only a missing or lapsed Google grant needs a trip to Google; anything else is a real error.
      const message = error instanceof Error ? error.message : "";
      if (!/Authorize a Google account|re-authorized|authorization .*expired/i.test(message)) return unwrap(error);
      // One redirect per page load: a second consent flow would invalidate the first one's state.
      if (!googleRedirectStarted) {
        googleRedirectStarted = true;
        const { url } = await startFirebaseAuthorization();
        window.location.href = url;
      }
      // Stay pending while the browser leaves for Google so the UI keeps its loader.
      return await new Promise<never>(() => {});
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
    // Stay pending while the browser leaves for Google so the caller keeps its loader.
    return await new Promise<{ status: "connected" }>(() => {});
  },
  disconnect: (id: string) => disconnectFirebaseProject({ data: { id } }),
  remove: (id: string) => removeFirebaseProject({ data: { id } }),
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
  remove: (id: string, confirmSlug: string) => deleteApp({ data: { id, confirmSlug } }),
  setSigning: (id: string, input: { publicKeyPem?: string | null; required: boolean }) =>
    setAppSigning({ data: { id, ...input } }),
  runtimes: (appId: string): Promise<RuntimeGroup[]> => listRuntimes({ data: { appId } }) as Promise<RuntimeGroup[]>,
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
    version?: string;
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
        ...(input.version ? { version: input.version } : {}),
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
  resume: (id: string) => resumeReleaseFn({ data: { releaseId: id } }),
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
  promote: (channelName: string, releaseId: string, rolloutPercentage?: number) =>
    promoteReleaseFn({ data: { releaseId, channelName, ...(rolloutPercentage !== undefined ? { rolloutPercentage } : {}) } }),
  create: (input: { appId: string; name: string; environment: string; description?: string; updatePolicy?: "immediate" | "staged" }) =>
    createChannel({ data: input }),
  update: (
    id: string,
    patch: { name?: string; environment?: string; description?: string; status?: "active" | "paused"; updatePolicy?: "immediate" | "staged" },
  ) => updateChannel({ data: { id, ...patch } }),
  remove: (id: string) => deleteChannel({ data: { id } }),
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
      data: {
        // "all" is the UI's "every application" option, not an app ID.
        ...(filters?.["appId"] && filters["appId"] !== "all" ? { appId: filters["appId"] } : {}),
        days: ({ "7d": 7, "30d": 30, "90d": 90 } as Record<string, number>)[filters?.["range"] ?? ""] ?? 14,
      },
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
  invite: (email: string, role: Role, customRoleId?: string | null) =>
    inviteMember({ data: { email, role, customRoleId: customRoleId ?? null } }),
  changeRole: (id: string, role: Role, customRoleId?: string | null) =>
    changeMemberRole({ data: { id, role, customRoleId: customRoleId ?? null } }),
  remove: (id: string) => removeMember({ data: { id } }),
  resendInvite: (id: string) => resendInvite({ data: { id } }),
  setStatus: (id: string, status: "active" | "suspended") => setMemberStatus({ data: { id, status } }),
  roles: (): Promise<CustomRole[]> => listRoles() as Promise<CustomRole[]>,
  saveRole: (input: { id?: string; name: string; description?: string; permissions: string[] }) => saveRole({ data: input }),
  deleteRole: (id: string) => deleteRole({ data: { id } }),
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
  remove: (id: string) => deleteApiKey({ data: { id } }),
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
  update: (id: string, patch: { events?: string[]; status?: "active" | "paused"; rotateSecret?: boolean }) =>
    updateWebhook({ data: { id, ...patch } }),
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
  settings: () => getAgentSettings(),
  saveSettings: (input: { provider: "anthropic" | "openai"; model: string; apiKey?: string; enabled: boolean }) =>
    saveAgentSettings({ data: input }),
  removeSettings: () => removeAgentSettings(),
  setToolMode: (agentId: string, tool: string, mode: "allowed" | "requires_approval" | "denied") =>
    setAgentToolMode({ data: { agentId, tool, mode } }),
  setEnabled: (agentId: string, enabled: boolean) => setAgentEnabled({ data: { agentId, enabled } }),
  run: (
    agentId: string,
    prompt: string,
    options: {
      history?: { role: "user" | "assistant"; content: string }[];
      attachment?: { name: string; size: number; sha256: string };
    } = {},
  ) => runAgentFn({ data: { agentId, prompt, ...options } }),
  /** SHA-256 of a package picked in the chat (sent to the agent as metadata only). */
  hashFile: (file: File) => sha256Browser(file),
  /** Uploads a chat attachment to the draft release an agent created. */
  uploadBundle: (releaseId: string, file: File, progress: (stage: string, percent: number) => void = () => {}) =>
    uploadBundleToBackend(releaseId, { file, progress }),
};

/** Saved agent chats for the signed-in member. */
export const conversationsService = {
  list: () => listConversations(),
  get: async (id: string) => {
    const chat = await getConversation({ data: { id } });
    return { ...chat, messages: JSON.parse(chat.messagesJson) as unknown[] };
  },
  save: (input: { id: string; title: string; agentId: string | null; messages: unknown[] }) =>
    saveConversation({ data: input }),
  rename: (id: string, title: string) => renameConversation({ data: { id, title } }),
  remove: (id: string) => deleteConversation({ data: { id } }),
};

export const notificationsService = {
  list: (): Promise<NotificationItem[]> => listNotifications() as Promise<NotificationItem[]>,
  markAllRead: () => markNotificationsRead(),
  prefs: () => getNotificationPrefs(),
  savePrefs: (prefs: Record<string, boolean>) => updateNotificationPrefs({ data: { prefs } }),
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
    { label: "Manage team & roles", allow: ["owner", "admin"] },
    { label: "API keys", allow: ["owner", "admin"] },
    { label: "Channels: create / edit", allow: ["owner", "admin", "release_manager"] },
    { label: "Channels & apps: delete", allow: ["owner", "admin"] },
    { label: "Connect / remove Firebase", allow: ["owner", "admin"] },
    { label: "Security alerts", allow: ["owner", "admin", "release_manager"] },
    { label: "Delete workspace", allow: ["owner"] },
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
