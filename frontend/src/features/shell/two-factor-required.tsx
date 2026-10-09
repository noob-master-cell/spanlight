import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth";

import { useCurrentOrg } from "./project-context";
import { useSignOut } from "./use-sign-out";

/**
 * Stands in for an organization's pages when the API answers `403 TWO_FACTOR_REQUIRED` (Figma
 * "Overview — Two-factor required"). It says what to do and where, and the way there stays open.
 */
export function TwoFactorRequired() {
  const { user } = useMe();
  const org = useCurrentOrg();
  const signOut = useSignOut();
  const orgName = org?.name ?? "This organization";

  return (
    <div className="flex flex-1 items-start justify-center lg:items-center">
      <section
        aria-labelledby="two-factor-required-title"
        className="flex w-full max-w-[560px] flex-col gap-5 rounded-card border border-border bg-surface px-6 py-7 shadow-card sm:gap-6 sm:p-10"
      >
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-tile bg-accent-subtle text-accent"
        >
          <Lock className="size-[26px]" strokeWidth={2} />
        </span>

        <div className="flex flex-col gap-2.5">
          <h2
            id="two-factor-required-title"
            className="text-[1.5rem] leading-[1.2] font-bold tracking-[-0.03em] text-foreground sm:text-h1"
          >
            Turn on two-factor authentication
          </h2>
          <p className="text-lg text-muted-foreground">
            <span className="font-semibold text-foreground">{orgName}</span> requires two-factor
            authentication. Turn it on in Settings › Security to continue.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
          <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
            {/* The project-less page: it opens even when no project does. */}
            <Link to="/account/security">Open Settings › Security</Link>
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full sm:w-auto"
            loading={signOut.isPending}
            onClick={() => {
              signOut.mutate();
            }}
          >
            Sign out
          </Button>
        </div>

        <div className="h-px bg-border" />
        <p className="text-xs font-medium text-muted-foreground">
          Signed in as {user.email}. Until two-factor is on,{" "}
          {org ? org.name : "this organization's"} projects, traces and settings stay locked; your
          account settings stay open.
        </p>
      </section>
    </div>
  );
}
