import { LayoutDashboard, ListTree, MessagesSquare, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to:
    | "/$orgId/$projectId/overview"
    | "/$orgId/$projectId/traces"
    | "/$orgId/$projectId/sessions"
    | "/$orgId/$projectId/settings";
  icon: LucideIcon;
  shortcut: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/$orgId/$projectId/overview", icon: LayoutDashboard, shortcut: "G O" },
  { label: "Traces", to: "/$orgId/$projectId/traces", icon: ListTree, shortcut: "G T" },
  { label: "Sessions", to: "/$orgId/$projectId/sessions", icon: MessagesSquare, shortcut: "G S" },
  { label: "Settings", to: "/$orgId/$projectId/settings", icon: Settings, shortcut: "G ," },
];
