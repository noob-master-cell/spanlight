import { getRouteApi, Link } from "@tanstack/react-router";
import { Waypoints } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell";
import { isApiError } from "@/lib/api";

import { GatewayLayout } from "../gateway-layout";

import { ExistingRouteEditor } from "./route-editor-existing";
import { RouteEditorSkeleton } from "./route-editor-skeleton";
import { useRouteQuery } from "./routes-queries";
import { useRouteLookups } from "./use-route-lookups";

const editorRoute = getRouteApi("/_authed/$orgId/$projectId/gateway/routes/$routeId");

/** Gateway › Routes › a route: loading, missing and failed states around the editor. */
export function RouteEditorPage() {
  const { routeId } = editorRoute.useParams();
  return (
    <GatewayLayout>
      {/* Keyed by route, so moving between routes starts a fresh form. */}
      <RouteEditorContent key={routeId} routeId={routeId} />
    </GatewayLayout>
  );
}

function RouteEditorContent({ routeId }: { routeId: string }) {
  const { orgId, projectId } = useProjectParams();
  const routeQuery = useRouteQuery(routeId);
  const lookups = useRouteLookups();

  if (routeQuery.isPending || (!lookups.credentialsLoaded && !lookups.credentialsError)) {
    return <RouteEditorSkeleton />;
  }
  if (routeQuery.isError) {
    if (isApiError(routeQuery.error) && routeQuery.error.isNotFound) {
      return (
        <EmptyState
          icon={Waypoints}
          title="Route not found"
          description="It may have been deleted, or it belongs to another project."
          action={
            <Button variant="primary" asChild>
              <Link to="/$orgId/$projectId/gateway/routes" params={{ orgId, projectId }}>
                Back to routes
              </Link>
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        error={routeQuery.error}
        title="Couldn't load this route"
        onRetry={() => {
          void routeQuery.refetch();
        }}
      />
    );
  }
  return <ExistingRouteEditor route={routeQuery.data} lookups={lookups} />;
}
