import {
  LayoutDashboard,
  ListTree,
  MessagesSquare,
  Settings,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to:
    | "/$orgId/$projectId/overview"
    | "/$orgId/$projectId/traces"
    | "/$orgId/$projectId/sessions"
    | "/$orgId/$projectId/gateway"
    | "/$orgId/$projectId/settings";
  icon: LucideIcon;
  shortcut: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/$orgId/$projectId/overview", icon: LayoutDashboard, shortcut: "G O" },
  { label: "Traces", to: "/$orgId/$projectId/traces", icon: ListTree, shortcut: "G T" },
  { label: "Sessions", to: "/$orgId/$projectId/sessions", icon: MessagesSquare, shortcut: "G S" },
  { label: "Gateway", to: "/$orgId/$projectId/gateway", icon: Waypoints, shortcut: "G G" },
  { label: "Settings", to: "/$orgId/$projectId/settings", icon: Settings, shortcut: "G ," },
];
