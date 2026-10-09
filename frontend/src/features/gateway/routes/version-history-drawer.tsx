import { useState } from "react";

import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/features/shell";
import type { Route, RouteVersion } from "@/lib/api";

import { RevertDialog } from "./revert-dialog";
import { useRouteVersionsQuery } from "./routes-queries";
import type { CredentialNamer } from "./version-diff";
import { VersionDiffPanel } from "./version-diff-panel";
import { VersionRow } from "./version-row";

/** Versions listed before "Show N older versions". */
const VISIBLE_VERSIONS = 3;

interface VersionHistoryDrawerProps {
  route: Route;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nameOf: CredentialNamer;
  revert: RevertHandlers;
}

interface RevertHandlers {
  /** The editor has unsaved edits, which a revert replaces. */
  dirty: boolean;
  /** A revert saved a new version; the editor shows it. */
  onReverted: (route: Route) => void;
}

/**
 * Figma "Gateway — Route editor — history drawer": every saved version, newest first, with what
 * each changed; selecting one compares it with the current version and offers to revert to it.
 */
export function VersionHistoryDrawer({
  route,
  open,
  onOpenChange,
  nameOf,
  revert,
}: VersionHistoryDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] gap-4 p-6">
        <div className="flex flex-col gap-1.5 pr-10">
          <SheetTitle className="text-h2 text-foreground">Version history</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {route.name} has {route.version === 1 ? "1 version" : `${route.version} versions`}.
            Select one to compare it with the current version.
          </SheetDescription>
        </div>
        {open ? (
          <HistoryBody
            route={route}
            nameOf={nameOf}
            revert={{
              dirty: revert.dirty,
              onReverted: (saved) => {
                onOpenChange(false);
                revert.onReverted(saved);
              },
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface HistoryBodyProps {
  route: Route;
  nameOf: CredentialNamer;
  revert: RevertHandlers;
}

function HistoryBody({ route, nameOf, revert }: HistoryBodyProps) {
  const query = useRouteVersionsQuery(route.id, true);

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading versions" className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-[76px] rounded-tile" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load versions"
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  return (
    <VersionBrowser
      route={route}
      versions={query.data}
      nameOf={nameOf}
      revert={revert}
      refreshing={query.isFetching}
    />
  );
}

interface VersionBrowserProps extends HistoryBodyProps {
  /** Newest first, as the API lists them. */
  versions: readonly RouteVersion[];
  /** The list is being refetched: the next version number may still change, so wait. */
  refreshing: boolean;
}

function VersionBrowser({ route, versions, nameOf, revert, refreshing }: VersionBrowserProps) {
  const canWrite = usePermission("gateway:write");
  const current = versions[0];
  const [selected, setSelected] = useState<number | null>(versions[1]?.version ?? null);
  const [showAll, setShowAll] = useState(false);
  const [reverting, setReverting] = useState<number | null>(null);
  if (!current) {
    return null;
  }
  const shown = showAll ? versions : versions.slice(0, VISIBLE_VERSIONS);
  const hidden = versions.length - shown.length;
  const selectedVersion = versions.find((version) => version.version === selected) ?? null;

  return (
    <>
      <ul aria-label="Versions" className="flex flex-col gap-2">
        {shown.map((version) => (
          <VersionRow
            key={version.version}
            version={version}
            versions={versions}
            nameOf={nameOf}
            selected={version.version === selected}
            onSelect={() => {
              setSelected(version.version === current.version ? null : version.version);
            }}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <Button
          variant="link"
          size="sm"
          className="self-start"
          onClick={() => {
            setShowAll(true);
          }}
        >
          Show {hidden === 1 ? "1 older version" : `${hidden} older versions`}
        </Button>
      ) : null}
      {versions.length === 1 ? (
        <p className="text-xs font-medium text-muted-foreground">
          This is the only version. Saving a change adds version 2.
        </p>
      ) : null}
      {selectedVersion ? (
        <VersionDiffPanel selected={selectedVersion} current={current} nameOf={nameOf} />
      ) : null}
      {selectedVersion && canWrite ? (
        <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Saves a new version {current.version + 1} with{" "}
            {`version ${selectedVersion.version}’s settings.`}
          </p>
          <Button
            variant="primary"
            loading={refreshing}
            onClick={() => {
              setReverting(selectedVersion.version);
            }}
          >
            Revert to version {selectedVersion.version}
          </Button>
        </div>
      ) : null}
      <RevertDialog
        route={route}
        target={reverting === null ? null : { version: reverting, next: current.version + 1 }}
        dirty={revert.dirty}
        onClose={() => {
          setReverting(null);
        }}
        onReverted={revert.onReverted}
      />
    </>
  );
}
