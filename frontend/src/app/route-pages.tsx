import { HeadContent, Link, Outlet, type ErrorComponentProps } from "@tanstack/react-router";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * The root route's component. HeadContent renders the matched route's <title>, which React
 * hoists into <head> ahead of index.html's. If a page fails, the error page replaces this
 * layout and index.html's title shows again.
 */
export function RootLayout() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This page doesn't exist, or you don't have access to it."
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to your projects</Link>
          </Button>
        }
      />
    </div>
  );
}

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <ErrorState error={error} onRetry={reset} title="This page failed to load" />
    </div>
  );
}
