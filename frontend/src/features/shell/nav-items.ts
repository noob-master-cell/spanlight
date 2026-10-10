import {
  BellRing,
  GitCompareArrows,
  LayoutDashboard,
  ListTree,
  MessagesSquare,
  Settings,
  Stethoscope,
  Users,
  Waypoints,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to:
    | "/$orgId/$projectId/overview"
    | "/$orgId/$projectId/traces"
    | "/$orgId/$projectId/sessions"
    | "/$orgId/$projectId/doctor"
    | "/$orgId/$projectId/releases"
    | "/$orgId/$projectId/users"
    | "/$orgId/$projectId/gateway"
    | "/$orgId/$projectId/alerts"
    | "/$orgId/$projectId/budgets"
    | "/$orgId/$projectId/settings";
  icon: LucideIcon;
  shortcut: string;
  /** A live count rendered after the label in the rail. */
  badge?: "open-critical";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/$orgId/$projectId/overview", icon: LayoutDashboard, shortcut: "G O" },
  { label: "Traces", to: "/$orgId/$projectId/traces", icon: ListTree, shortcut: "G T" },
  { label: "Sessions", to: "/$orgId/$projectId/sessions", icon: MessagesSquare, shortcut: "G S" },
  {
    label: "Doctor",
    to: "/$orgId/$projectId/doctor",
    icon: Stethoscope,
    shortcut: "G D",
    badge: "open-critical",
  },
  {
    label: "Releases",
    to: "/$orgId/$projectId/releases",
    icon: GitCompareArrows,
    shortcut: "G R",
  },
  { label: "Users", to: "/$orgId/$projectId/users", icon: Users, shortcut: "G U" },
  { label: "Gateway", to: "/$orgId/$projectId/gateway", icon: Waypoints, shortcut: "G G" },
  { label: "Alerts", to: "/$orgId/$projectId/alerts", icon: BellRing, shortcut: "G A" },
  { label: "Budgets", to: "/$orgId/$projectId/budgets", icon: Wallet, shortcut: "G B" },
  { label: "Settings", to: "/$orgId/$projectId/settings", icon: Settings, shortcut: "G ," },
];
