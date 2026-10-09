import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { MailOpen, MailX, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authApi, errorMessage, isApiError, queryKeys, type Me } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { AuthCenteredLayout } from "./auth-layout";
import { refreshMe } from "./queries";

const routeApi = getRouteApi("/invite/$token");

const UNUSABLE_INVITE_MESSAGE =
  "This invite link is invalid, has expired, or was already used. Ask an admin for a new one.";

function isUnusableInvite(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 410);
}

function inviteErrorMessage(error: unknown): string {
  if (isUnusableInvite(error)) {
    return UNUSABLE_INVITE_MESSAGE;
  }
  if (isApiError(error) && error.status === 409) {
    return "You're already a member of this organization.";
  }
  return errorMessage(error);
}

export function InvitePage() {
  const { token } = routeApi.useParams();
  const me = routeApi.useRouteContext({ select: (context) => context.me });

  return (
    <AuthCenteredLayout>
      {me ? <SignedInInvite token={token} me={me} /> : <SignedOutInvite token={token} />}
    </AuthCenteredLayout>
  );
}

/** Not signed in: the preview needs a session, so offer sign up / sign in first. */
function SignedOutInvite({ token }: { token: string }) {
  const nextPath = `/invite/${token}`;
  return (
    <InviteCard icon={MailOpen}>
      <InviteHeading title="You've been invited">
        <p className="text-sm text-muted-foreground">
          Sign in or create an account to see the invitation and join the organization.
        </p>
      </InviteHeading>
      <div className="flex flex-col gap-2.5">
        <Button asChild variant="primary" size="lg">
          <Link to="/signup" search={{ next: nextPath }}>
            Create an account
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link to="/login" search={{ next: nextPath }}>
            Sign in
          </Link>
        </Button>
      </div>
    </InviteCard>
  );
}

function SignedInInvite({ token, me }: { token: string; me: Me }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const nextPath = `/invite/${token}`;

  const preview = useQuery({
    queryKey: queryKeys.invitePreview(token),
    queryFn: () => authApi.previewInvite(token),
    retry: (failureCount, error) => !isUnusableInvite(error) && failureCount < 2,
  });

  const accept = useMutation({
    mutationFn: () => authApi.acceptInvite(token),
    onSuccess: async ({ org, role }) => {
      toast.success(`You joined ${org.name} as ${ROLE_LABELS[role].toLowerCase()}.`);
      await refreshMe(queryClient);
      await navigate({ to: "/" });
    },
  });

  const switchAccount = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login", search: { next: nextPath } });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (preview.isPending) {
    return <InviteSkeleton />;
  }

  if (preview.isError) {
    const unusable = isUnusableInvite(preview.error);
    return (
      <InviteCard icon={MailX} tone="danger">
        <InviteHeading title={unusable ? "This invite can't be used" : "Couldn't load this invite"}>
          <p className="text-sm text-muted-foreground">
            {unusable ? UNUSABLE_INVITE_MESSAGE : errorMessage(preview.error)}
          </p>
        </InviteHeading>
        <div className="flex flex-col gap-2.5">
          {unusable ? null : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                void preview.refetch();
              }}
            >
              Try again
            </Button>
          )}
          <Button asChild size="lg">
            <Link to="/">Go to your projects</Link>
          </Button>
        </div>
      </InviteCard>
    );
  }

  const { org, role } = preview.data;

  return (
    <InviteCard icon={MailOpen}>
      <InviteHeading title={`You're invited to join ${org.name}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">You’ll join as</span>
          <Badge variant="violet">{ROLE_LABELS[role]}</Badge>
        </div>
      </InviteHeading>

      <p className="text-sm text-muted-foreground">
        You’re signed in as <span className="font-semibold text-foreground">{me.user.email}</span>.
        Accepting adds this account to {org.name}.
      </p>

      <Notice>
        Invite links work once and expire. Your role is set by whoever created the link.
      </Notice>

      {accept.isError ? (
        <Notice tone="danger" role="alert">
          {inviteErrorMessage(accept.error)}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button
          variant="primary"
          size="lg"
          loading={accept.isPending}
          disabled={switchAccount.isPending}
          onClick={() => {
            accept.mutate();
          }}
        >
          Accept invite
        </Button>
        <Button
          size="lg"
          loading={switchAccount.isPending}
          disabled={accept.isPending}
          onClick={() => {
            switchAccount.mutate();
          }}
        >
          Sign in with a different account
        </Button>
      </div>
    </InviteCard>
  );
}

interface InviteCardProps {
  icon: LucideIcon;
  tone?: "accent" | "danger";
  children: ReactNode;
}

function InviteCard({ icon: Icon, tone = "accent", children }: InviteCardProps) {
  return (
    <section
      aria-labelledby="invite-title"
      className="flex w-full max-w-[480px] flex-col gap-6 rounded-card border border-border bg-surface p-6 shadow-card sm:p-10"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-14 items-center justify-center rounded-tile",
          tone === "danger" ? "bg-danger-subtle text-danger" : "bg-accent-subtle text-accent",
        )}
      >
        <Icon className="size-6" strokeWidth={2} />
      </span>
      {children}
    </section>
  );
}

function InviteHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-overline text-subtle-foreground uppercase">Invitation</p>
      <h1 id="invite-title" className="text-h1 [overflow-wrap:anywhere] text-foreground">
        {title}
      </h1>
      {children}
    </div>
  );
}

function InviteSkeleton() {
  return (
    <section
      aria-busy
      aria-label="Loading invitation"
      className="flex w-full max-w-[480px] flex-col gap-6 rounded-card border border-border bg-surface p-6 shadow-card sm:p-10"
    >
      <Skeleton className="size-14 rounded-tile" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-6 w-40" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full rounded-full" />
    </section>
  );
}
