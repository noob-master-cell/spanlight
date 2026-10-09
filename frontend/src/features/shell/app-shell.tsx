import { Outlet, useMatchRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { NotFoundPage } from "@/app/route-pages";
import { ErrorState } from "@/components/error-state";
import { MeshBackdrop } from "@/components/mesh-backdrop";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { isApiError } from "@/lib/api";
import { writeLastProject } from "@/lib/last-project";

import { CommandPalette } from "./command-palette";
import { useProjectParams, useProjectQuery } from "./project-context";
import { Sidebar } from "./sidebar";
import { MobileAppBar, MobileDataFilters, Topbar } from "./topbar";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

/** Pages that show time-windowed data get the range and environment controls. */
function useShowsDataFilters(): boolean {
  const matchRoute = useMatchRoute();
  return Boolean(
    matchRoute({ to: "/$orgId/$projectId/overview" }) ||
    matchRoute({ to: "/$orgId/$projectId/traces" }) ||
    matchRoute({ to: "/$orgId/$projectId/sessions" }),
  );
}

/**
 * The signed-in layout.
 *
 * Desktop (≥ 1024px): canvas with a 12px gutter, the floating dark rail on the left and the
 * rounded main panel (mesh backdrop, in-panel top bar) on the right. The page scrolls the
 * window; the rail stays pinned.
 *
 * Phones and tablets: no gutter, a sticky app bar, the rail in a sheet, and the data filters
 * in a row above the page content.
 *
 * Pages render inside `<main>`, which already provides horizontal padding (16px / 40px), top
 * spacing and a 1440px max width. Pages should not add their own outer padding.
 */
export function AppShell() {
  const params = useProjectParams();
  const projectQuery = useProjectQuery();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showsDataFilters = useShowsDataFilters();

  const togglePalette = useCallback(() => {
    setPaletteOpen((current) => !current);
  }, []);
  const openPalette = useCallback(() => {
    setMobileNavOpen(false);
    setPaletteOpen(true);
  }, []);
  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  useKeyboardShortcuts(togglePalette);

  useEffect(() => {
    if (projectQuery.isSuccess) {
      writeLastProject({ orgId: params.orgId, projectId: params.projectId });
    }
  }, [params.orgId, params.projectId, projectQuery.isSuccess]);

  if (projectQuery.isError && isApiError(projectQuery.error) && projectQuery.error.isNotFound) {
    return <NotFoundPage />;
  }

  return (
    <div className="min-h-dvh bg-background lg:flex lg:gap-3 lg:bg-canvas lg:p-3">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-surface px-4 py-2 text-sm font-semibold shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)]">
          <Sidebar />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" hideClose className="w-[264px] border-0 bg-transparent p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Switch projects and move between pages
          </SheetDescription>
          <Sidebar
            onNavigate={closeMobileNav}
            headerAction={
              <div className="flex items-center gap-1.5">
                <ThemeToggle tone="rail" />
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close navigation"
                    className="bg-rail-tile text-rail-foreground hover:bg-rail-tile-hover focus-visible:outline-lime"
                  >
                    <X aria-hidden />
                  </Button>
                </SheetClose>
              </div>
            }
          />
        </SheetContent>
      </Sheet>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background lg:min-h-[calc(100dvh-1.5rem)] lg:rounded-card">
        <MeshBackdrop className="-top-[120px] -left-[200px] lg:top-0 lg:-right-4 lg:left-auto" />

        <MobileAppBar
          className="lg:hidden"
          onOpenCommandPalette={openPalette}
          onOpenNavigation={() => {
            setMobileNavOpen(true);
          }}
        />

        <div className="relative mx-auto hidden w-full max-w-[1440px] px-10 pt-7 lg:block">
          <Topbar onOpenCommandPalette={openPalette} showDataFilters={showsDataFilters} />
        </div>

        {showsDataFilters ? (
          <div className="relative px-4 pt-3 lg:hidden">
            <MobileDataFilters />
          </div>
        ) : null}

        <main
          id="main"
          tabIndex={-1}
          className="relative mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col px-4 pt-6 pb-12 outline-none lg:px-10 lg:pt-8"
        >
          {projectQuery.isError ? (
            <ErrorState
              error={projectQuery.error}
              onRetry={() => {
                void projectQuery.refetch();
              }}
            />
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
