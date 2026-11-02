import {
  Activity,
  BookOpen,
  Boxes,
  Bot,
  Cloud,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Play,
  ScrollText,
  Settings,
  ShieldAlert,
  Terminal,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hidden for members without this permission. */
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { label: "Applications", to: "/apps", icon: Boxes, permission: "app.read" },
      { label: "Releases", to: "/releases", icon: Activity, permission: "release.read" },
      { label: "Channels", to: "/channels", icon: GitBranch, permission: "channel.read" },
      { label: "Rollouts", to: "/rollouts", icon: Play, permission: "rollout.read" },
      { label: "Analytics", to: "/analytics", icon: LineChart, permission: "analytics.read" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Storage", to: "/projects", icon: Cloud, permission: "project.read" },
      { label: "Team", to: "/team", icon: Users, permission: "team.read" },
      { label: "Audit Logs", to: "/audit-logs", icon: ScrollText, permission: "audit.read" },
      { label: "Security", to: "/security", icon: ShieldAlert, permission: "security.read" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { label: "API Keys", to: "/settings/api-keys", icon: KeyRound, permission: "api_key.read" },
      { label: "CI/CD", to: "/settings/ci-cd", icon: Terminal, permission: "api_key.read" },
      { label: "Webhooks", to: "/settings/webhooks", icon: Webhook, permission: "webhook.read" },
    ],
  },
  {
    label: "Automation",
    items: [{ label: "Agents", to: "/agents", icon: Bot, permission: "agent.read" }],
  },
  {
    label: "System",
    items: [
      { label: "Settings", to: "/settings", icon: Settings },
      { label: "Help", to: "/docs", icon: BookOpen },
    ],
  },
];

/** Most specific first: creating something needs more than viewing the list it belongs to. */
const ROUTE_PERMISSIONS: [string, string][] = [
  ["/apps/new", "app.create"],
  ["/projects/connect", "project.connect"],
  ["/apps", "app.read"],
  ["/releases", "release.read"],
  ["/channels", "channel.read"],
  ["/rollouts", "rollout.read"],
  ["/analytics", "analytics.read"],
  ["/projects", "project.read"],
  ["/team", "team.read"],
  ["/audit-logs", "audit.read"],
  ["/security", "security.read"],
  ["/settings/api-keys", "api_key.read"],
  ["/settings/ci-cd", "api_key.read"],
  ["/settings/webhooks", "webhook.read"],
  ["/agents", "agent.read"],
];

/**
 * Returns the permission required to access a route pathname, or undefined if open to every member.
 */
export function getRequiredPermissionForPath(pathname: string): string | undefined {
  if (/^\/apps\/[^/]+\/releases\/new\/?$/.test(pathname)) return "release.create";
  return ROUTE_PERMISSIONS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1];
}
