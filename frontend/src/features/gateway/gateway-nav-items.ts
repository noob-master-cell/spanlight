/** Every gateway page the sub-navigation links to. */
export type GatewayPath =
  | "/$orgId/$projectId/gateway"
  | "/$orgId/$projectId/gateway/keys"
  | "/$orgId/$projectId/gateway/routes"
  | "/$orgId/$projectId/gateway/credentials"
  | "/$orgId/$projectId/gateway/lab";

export interface GatewayNavItem {
  label: string;
  to: GatewayPath;
  /** The overview is the parent of every other page, so only an exact match makes it active. */
  exact: boolean;
}

/** Figma "Gateway/Sub-nav": Overview · Keys · Routes · Credentials · Lab. */
export const GATEWAY_NAV_ITEMS: readonly GatewayNavItem[] = [
  { label: "Overview", to: "/$orgId/$projectId/gateway", exact: true },
  { label: "Keys", to: "/$orgId/$projectId/gateway/keys", exact: false },
  { label: "Routes", to: "/$orgId/$projectId/gateway/routes", exact: false },
  { label: "Credentials", to: "/$orgId/$projectId/gateway/credentials", exact: false },
  { label: "Lab", to: "/$orgId/$projectId/gateway/lab", exact: false },
];

/** `/o/p/gateway/routes/abc` → `routes`: the segment after `gateway`, or null on the overview. */
function gatewaySegment(path: string): string | null {
  const segments = path.split("/").filter((segment) => segment !== "");
  const index = segments.lastIndexOf("gateway");
  return index === -1 ? null : (segments[index + 1] ?? null);
}

/** The nav item for the page at `pathname`, for the mobile picker's label. */
export function activeGatewayItem(pathname: string): GatewayNavItem | null {
  const current = gatewaySegment(pathname);
  if (current === null && !/\/gateway\/?$/.test(pathname)) {
    return null;
  }
  return (
    GATEWAY_NAV_ITEMS.find((item) =>
      current === null ? item.exact : gatewaySegment(item.to) === current,
    ) ?? null
  );
}
