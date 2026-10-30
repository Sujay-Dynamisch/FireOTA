import {
  Activity,
  BookOpen,
  Boxes,
  Bot,
  Cloud,
  Database,
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
      { label: "Applications", to: "/apps", icon: Boxes },
      { label: "Releases", to: "/releases", icon: Activity },
      { label: "Channels", to: "/channels", icon: GitBranch },
      { label: "Rollouts", to: "/rollouts", icon: Play },
      { label: "Analytics", to: "/analytics", icon: LineChart },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Storage", to: "/projects", icon: Cloud },
      { label: "Team", to: "/team", icon: Users },
      { label: "Audit Logs", to: "/audit-logs", icon: ScrollText, permission: "audit.read" },
      { label: "Security", to: "/security", icon: ShieldAlert, permission: "security.read" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { label: "API Keys", to: "/settings/api-keys", icon: KeyRound, permission: "api_key.read" },
      { label: "CI/CD", to: "/settings/ci-cd", icon: Terminal },
      { label: "Webhooks", to: "/settings/webhooks", icon: Webhook },
    ],
  },
  {
    label: "Automation",
    items: [{ label: "Agents", to: "/agents", icon: Bot }],
  },
  {
    label: "System",
    items: [
      { label: "Settings", to: "/settings", icon: Settings },
      { label: "Help", to: "/docs", icon: BookOpen },
    ],
  },
];
