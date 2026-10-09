import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
  retainSearchParams,
} from "@tanstack/react-router";

import { NotFoundPage, RootLayout, RouteErrorPage } from "@/app/route-pages";
import { LoginPage } from "@/features/auth/login-page";
import { ensureMe } from "@/features/auth/queries";
import { authSearchSchema, safeNextPath } from "@/features/auth/search";
import { SignupPage } from "@/features/auth/signup-page";
import { TwoFactorPage } from "@/features/auth/two-factor-page";
import { onboardingSearchSchema } from "@/features/onboarding/search";
import { AppShell } from "@/features/shell/app-shell";
import { resolveHomeDestination } from "@/features/shell/home-redirect";
import { auditSearchSchema } from "@/features/settings/audit-search";
import { securitySearchSchema } from "@/features/settings/security/search";
import { traceDetailSearchSchema, traceFiltersSchema } from "@/features/traces/search";
import { projectSearchSchema } from "@/lib/time-range";

/*
 * Public pages and the app shell load eagerly; every page inside the shell is
 * code-split so the first paint doesn't pay for charts or the trace viewer.
 */

export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Each route names its page in the tab: "<Page> · Spanlight". Routes only set the title;
 * the description and social meta tags stay static in index.html.
 */
function pageTitle(page: string) {
  return { meta: [{ title: `${page} · Spanlight` }] };
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  // Every page names itself, so the root's title only shows when no route matched the URL.
  head: () => pageTitle("Page not found"),
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

/* ---------- Public routes ---------- */

/**
 * "/" is the marketing page for visitors; signed-in users go straight to their last project
 * (or onboarding), so they never load the landing chunk.
 */
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const me = await ensureMe(context.queryClient);
    if (me) {
      throw redirect(await resolveHomeDestination(context.queryClient, me));
    }
  },
  // The full title from index.html; without it the root's "Page not found" would show here.
  head: () => ({
    meta: [{ title: "Spanlight — Open-source LLM observability" }],
  }),
  component: lazyRouteComponent(() => import("@/features/landing/landing-page"), "LandingPage"),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: authSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const me = await ensureMe(context.queryClient);
    if (me) {
      throw redirect({ href: safeNextPath(search.next) ?? "/" });
    }
  },
  head: () => pageTitle("Sign in"),
  component: LoginPage,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: authSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const me = await ensureMe(context.queryClient);
    if (me) {
      throw redirect({ href: safeNextPath(search.next) ?? "/" });
    }
  },
  head: () => pageTitle("Create an account"),
  component: SignupPage,
});

/** The second step of signing in. The challenge is never in this URL; see `login-challenge.ts`. */
const twoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login/two-factor",
  validateSearch: authSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const me = await ensureMe(context.queryClient);
    if (me) {
      throw redirect({ href: safeNextPath(search.next) ?? "/" });
    }
  },
  head: () => pageTitle("Two-factor sign-in"),
  component: TwoFactorPage,
});

/*
 * The three account-recovery pages are open to everyone, signed in or not: a forgotten password,
 * a reset link and a verification link are all opened by people who may have no session. Their
 * secrets arrive in the URL fragment (see `fragment-token.ts`).
 */
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  head: () => pageTitle("Reset your password"),
  component: lazyRouteComponent(
    () => import("@/features/auth/forgot-password-page"),
    "ForgotPasswordPage",
  ),
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  head: () => pageTitle("Choose a new password"),
  component: lazyRouteComponent(
    () => import("@/features/auth/reset-password-page"),
    "ResetPasswordPage",
  ),
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  head: () => pageTitle("Verify your email"),
  component: lazyRouteComponent(
    () => import("@/features/auth/verify-email-page"),
    "VerifyEmailPage",
  ),
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  beforeLoad: async ({ context }) => ({ me: await ensureMe(context.queryClient) }),
  head: () => pageTitle("Invitation"),
  component: lazyRouteComponent(() => import("@/features/auth/invite-page"), "InvitePage"),
});

/* ---------- Authenticated routes ---------- */

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authed",
  beforeLoad: async ({ context, location }) => {
    const me = await ensureMe(context.queryClient);
    if (!me) {
      throw redirect({ to: "/login", search: { next: location.href } });
    }
    return { me };
  },
  component: Outlet,
});

const onboardingRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/onboarding",
  validateSearch: onboardingSearchSchema,
  head: () => pageTitle("Setup"),
  component: lazyRouteComponent(
    () => import("@/features/onboarding/onboarding-page"),
    "OnboardingPage",
  ),
});

/**
 * The Security page with no project around it. Where an organization requires two-factor
 * authentication and the person has none, every project answers 403, so this is the one page that
 * always opens, and the place home sends them (see `resolveHomeDestination`).
 */
const accountSecurityRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/account/security",
  validateSearch: securitySearchSchema,
  head: () => pageTitle("Security"),
  component: lazyRouteComponent(
    () => import("@/features/settings/security/account-security-page"),
    "AccountSecurityPage",
  ),
});

const projectRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/$orgId/$projectId",
  validateSearch: projectSearchSchema,
  search: {
    middlewares: [retainSearchParams(["range", "from", "to", "env"])],
  },
  component: AppShell,
});

const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$orgId/$projectId/overview", params });
  },
});

const overviewRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/overview",
  head: () => pageTitle("Overview"),
  component: lazyRouteComponent(() => import("@/features/overview/overview-page"), "OverviewPage"),
});

const tracesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/traces",
  validateSearch: traceFiltersSchema,
  head: () => pageTitle("Traces"),
  component: lazyRouteComponent(() => import("@/features/traces/traces-page"), "TracesPage"),
});

const traceDetailRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/traces/$traceId",
  validateSearch: traceDetailSearchSchema,
  head: () => pageTitle("Trace"),
  component: lazyRouteComponent(
    () => import("@/features/traces/trace-detail-page"),
    "TraceDetailPage",
  ),
});

const sessionsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/sessions",
  head: () => pageTitle("Sessions"),
  component: lazyRouteComponent(() => import("@/features/sessions/sessions-page"), "SessionsPage"),
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/sessions/$sessionId",
  head: () => pageTitle("Session"),
  component: lazyRouteComponent(
    () => import("@/features/sessions/session-detail-page"),
    "SessionDetailPage",
  ),
});

const gatewayRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/gateway",
  head: () => pageTitle("Gateway"),
  component: lazyRouteComponent(
    () => import("@/features/gateway/overview-page"),
    "GatewayOverviewPage",
  ),
});

const gatewayKeysRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/gateway/keys",
  head: () => pageTitle("Gateway keys"),
  component: lazyRouteComponent(
    () => import("@/features/gateway/keys/keys-page"),
    "GatewayKeysPage",
  ),
});

const gatewayRoutesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/gateway/routes",
  head: () => pageTitle("Gateway routes"),
  component: lazyRouteComponent(
    () => import("@/features/gateway/routes/routes-page"),
    "GatewayRoutesPage",
  ),
});

const gatewayRouteEditorRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/gateway/routes/$routeId",
  head: () => pageTitle("Gateway route"),
  component: lazyRouteComponent(
    () => import("@/features/gateway/routes/route-editor-page"),
    "RouteEditorPage",
  ),
});

const gatewayCredentialsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/gateway/credentials",
  head: () => pageTitle("Provider credentials"),
  component: lazyRouteComponent(
    () => import("@/features/gateway/credentials/credentials-page"),
    "GatewayCredentialsPage",
  ),
});

const gatewayLabRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/gateway/lab",
  head: () => pageTitle("Integration Lab"),
  component: lazyRouteComponent(() => import("@/features/gateway/lab/lab-page"), "GatewayLabPage"),
});

const settingsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("@/features/settings/settings-layout"),
    "SettingsLayout",
  ),
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$orgId/$projectId/settings/project", params });
  },
});

const projectSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/project",
  head: () => pageTitle("Project settings"),
  component: lazyRouteComponent(
    () => import("@/features/settings/project-settings-page"),
    "ProjectSettingsPage",
  ),
});

const apiKeysRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/keys",
  head: () => pageTitle("API keys"),
  component: lazyRouteComponent(() => import("@/features/settings/api-keys-page"), "ApiKeysPage"),
});

const exportsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/exports",
  head: () => pageTitle("Exports"),
  component: lazyRouteComponent(() => import("@/features/settings/exports-page"), "ExportsPage"),
});

const organizationRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/organization",
  head: () => pageTitle("Organization settings"),
  component: lazyRouteComponent(
    () => import("@/features/settings/organization/organization-page"),
    "OrganizationPage",
  ),
});

const membersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/members",
  head: () => pageTitle("Members"),
  component: lazyRouteComponent(() => import("@/features/settings/members-page"), "MembersPage"),
});

const auditRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/audit",
  validateSearch: auditSearchSchema,
  head: () => pageTitle("Audit log"),
  component: lazyRouteComponent(() => import("@/features/settings/audit-log-page"), "AuditLogPage"),
});

const accountRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/account",
  head: () => pageTitle("Account"),
  component: lazyRouteComponent(() => import("@/features/settings/account-page"), "AccountPage"),
});

const securityRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/security",
  validateSearch: securitySearchSchema,
  head: () => pageTitle("Security"),
  component: lazyRouteComponent(
    () => import("@/features/settings/security/security-page"),
    "SecurityPage",
  ),
});

const tokensRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/tokens",
  head: () => pageTitle("Tokens"),
  component: lazyRouteComponent(
    () => import("@/features/settings/tokens/tokens-page"),
    "TokensPage",
  ),
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  twoFactorRoute,
  signupRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  verifyEmailRoute,
  inviteRoute,
  authedRoute.addChildren([
    onboardingRoute,
    accountSecurityRoute,
    projectRoute.addChildren([
      projectIndexRoute,
      overviewRoute,
      tracesRoute,
      traceDetailRoute,
      sessionsRoute,
      sessionDetailRoute,
      gatewayRoute,
      gatewayKeysRoute,
      gatewayRoutesRoute,
      gatewayRouteEditorRoute,
      gatewayCredentialsRoute,
      gatewayLabRoute,
      settingsRoute.addChildren([
        settingsIndexRoute,
        projectSettingsRoute,
        apiKeysRoute,
        exportsRoute,
        organizationRoute,
        membersRoute,
        auditRoute,
        accountRoute,
        securityRoute,
        tokensRoute,
      ]),
    ]),
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
