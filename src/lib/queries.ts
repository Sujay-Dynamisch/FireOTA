import { queryOptions } from "@tanstack/react-query";
import {
  activityService,
  authService,
  agentsService,
  analyticsService,
  apiKeysService,
  appsService,
  auditService,
  channelsService,
  ciCdService,
  dashboardService,
  firebaseService,
  notificationsService,
  organizationService,
  releasesService,
  rolloutsService,
  securityService,
  storageService,
  teamService,
  webhooksService,
} from "@/services";

export const q = {
  session: () => queryOptions({ queryKey: ["session"], queryFn: () => authService.session() }),
  dashboard: () => queryOptions({ queryKey: ["dashboard"], queryFn: () => dashboardService.summary() }),
  activity: () => queryOptions({ queryKey: ["activity"], queryFn: () => activityService.list() }),
  notifications: () =>
    queryOptions({ queryKey: ["notifications"], queryFn: () => notificationsService.list(), refetchInterval: 30_000 }),

  apps: () => queryOptions({ queryKey: ["apps"], queryFn: () => appsService.list() }),
  app: (id: string) => queryOptions({ queryKey: ["apps", id], queryFn: () => appsService.get(id) }),

  releases: (filters?: Parameters<typeof releasesService.list>[0]) =>
    queryOptions({ queryKey: ["releases", filters ?? null], queryFn: () => releasesService.list(filters) }),
  release: (id: string) => queryOptions({ queryKey: ["releases", id], queryFn: () => releasesService.get(id) }),

  channels: (appId?: string) =>
    queryOptions({ queryKey: ["channels", appId ?? null], queryFn: () => channelsService.list(appId) }),
  channel: (id: string) => queryOptions({ queryKey: ["channel", id], queryFn: () => channelsService.get(id) }),

  rollouts: () => queryOptions({ queryKey: ["rollouts"], queryFn: () => rolloutsService.list() }),
  rollout: (id: string) => queryOptions({ queryKey: ["rollout", id], queryFn: () => rolloutsService.get(id) }),

  analytics: (filters?: Record<string, string>) =>
    queryOptions({ queryKey: ["analytics", filters ?? null], queryFn: () => analyticsService.summary(filters) }),

  projects: () => queryOptions({ queryKey: ["projects"], queryFn: () => firebaseService.list() }),
  storageTargets: () => queryOptions({ queryKey: ["storage-targets"], queryFn: () => storageService.list() }),
  project: (id: string) => queryOptions({ queryKey: ["projects", id], queryFn: () => firebaseService.get(id) }),

  team: () => queryOptions({ queryKey: ["team"], queryFn: () => teamService.list() }),
  roles: () => queryOptions({ queryKey: ["roles"], queryFn: () => teamService.roles() }),
  security: (status: "open" | "resolved" | "all" = "open") =>
    queryOptions({ queryKey: ["security", status], queryFn: () => securityService.list(status) }),
  runtimes: (appId: string) => queryOptions({ queryKey: ["runtimes", appId], queryFn: () => appsService.runtimes(appId) }),
  agentSettings: () => queryOptions({ queryKey: ["agent-settings"], queryFn: () => agentsService.settings() }),
  notificationPrefs: () => queryOptions({ queryKey: ["notification-prefs"], queryFn: () => notificationsService.prefs() }),
  audit: (filters?: Parameters<typeof auditService.list>[0]) =>
    queryOptions({ queryKey: ["audit", filters ?? null], queryFn: () => auditService.list(filters) }),

  apiKeys: () => queryOptions({ queryKey: ["api-keys"], queryFn: () => apiKeysService.list() }),
  deployments: () => queryOptions({ queryKey: ["deployments"], queryFn: () => ciCdService.deployments() }),
  webhooks: () => queryOptions({ queryKey: ["webhooks"], queryFn: () => webhooksService.list() }),
  webhook: (id: string) => queryOptions({ queryKey: ["webhooks", id], queryFn: () => webhooksService.get(id) }),

  agents: () => queryOptions({ queryKey: ["agents"], queryFn: () => agentsService.list() }),
  agent: (id: string) => queryOptions({ queryKey: ["agents", id], queryFn: () => agentsService.get(id) }),
  agentExecutions: (agentId?: string) =>
    queryOptions({ queryKey: ["agent-executions", agentId ?? null], queryFn: () => agentsService.executions(agentId) }),
  agentApprovals: () => queryOptions({ queryKey: ["agent-approvals"], queryFn: () => agentsService.approvals() }),
};
