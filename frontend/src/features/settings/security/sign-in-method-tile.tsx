import type { ReactNode } from "react";

interface SignInMethodTileProps {
  icon: ReactNode;
  title: string;
  /** "Connected", next to the title. */
  badge?: ReactNode;
  /** The Connect or Disconnect button. */
  action?: ReactNode;
  /** The lines under the title: what it is, and a hint when it can't be disconnected. */
  children: ReactNode;
}

/** Figma "Settings/Sign-in method row": an icon tile, title and detail lines, an action at the end. */
export function SignInMethodTile({ icon, title, badge, action, children }: SignInMethodTileProps) {
  return (
    <li className="flex items-center gap-3.5 rounded-tile bg-surface-muted p-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-input border border-border bg-surface text-foreground"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        {children}
      </div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </li>
  );
}
