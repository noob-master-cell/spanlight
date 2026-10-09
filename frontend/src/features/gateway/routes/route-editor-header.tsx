import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface RouteEditorHeaderProps {
  name: string;
  /** Default and version badges, or "Not saved". */
  badges: ReactNode;
  /** The line under the name: who saved it and when, or that the route is new. */
  meta: ReactNode;
  /** The back link (or a button on an unsaved route): "← Routes". */
  back: ReactNode;
  /** History and the overflow menu. */
  actions?: ReactNode;
}

/** The route editor's header (Figma "Gateway — Route editor"): back link, name, badges, meta. */
export function RouteEditorHeader({ name, badges, meta, back, actions }: RouteEditorHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>{back}</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Focusable by script, so an editor that replaces the list can move focus here. */}
            <h2
              tabIndex={-1}
              className="text-h2 [overflow-wrap:anywhere] text-foreground outline-none"
            >
              {name}
            </h2>
            {badges}
          </div>
          <div className="text-xs font-medium text-muted-foreground">{meta}</div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** "← Routes", as a link or a button; pass the element and this styles its content. */
export function BackLabel() {
  return (
    <>
      <ArrowLeft aria-hidden />
      Routes
    </>
  );
}
