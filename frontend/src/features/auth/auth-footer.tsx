import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** The quiet line under an auth form, e.g. "New here? Create an account". */
export function AuthFooter({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-1 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

interface AuthBackLinkProps {
  /** The page the person was heading for, so signing in again still lands there. */
  next?: string | undefined;
}

/** "← Back to sign in", the way out of the forgot, reset and code steps. */
export function AuthBackLink({ next }: AuthBackLinkProps) {
  return (
    <Link
      to="/login"
      search={{ next }}
      className="flex min-h-11 items-center justify-center gap-1.5 self-center rounded-sm px-2 text-sm font-semibold text-accent hover:underline sm:min-h-0"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Back to sign in
    </Link>
  );
}
