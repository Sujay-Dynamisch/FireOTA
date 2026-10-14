import {
  Activity,
  BookOpen,
  Boxes,
  Bot,
  Database,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Play,
  ScrollText,
  Settings,
  Terminal,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
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
      { label: "Projects", to: "/projects", icon: Database },
      { label: "Team", to: "/team", icon: Users },
      { label: "Audit Logs", to: "/audit-logs", icon: ScrollText },
    ],
  },
  {
    label: "Integrations",
    items: [
      { label: "API Keys", to: "/settings/api-keys", icon: KeyRound },
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
