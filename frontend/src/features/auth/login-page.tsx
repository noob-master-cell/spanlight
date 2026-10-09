import { getRouteApi, Link } from "@tanstack/react-router";
import { CirclePlay } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AuthFooter } from "./auth-footer";
import { AuthLayout } from "./auth-layout";
import { LoginForm } from "./login-form";
import { LoginOAuthError } from "./login-oauth-error";
import { OAuthButtons } from "./oauth-buttons";
import { useDemoSession } from "./use-demo-session";

const routeApi = getRouteApi("/login");

export function LoginPage() {
  const { next, error } = routeApi.useSearch();
  const demo = useDemoSession();

  return (
    <AuthLayout
      title="Welcome"
      accent="back."
      description="Observe your LLM calls, costs and errors."
    >
      <LoginOAuthError code={error} />
      <OAuthButtons next={next} dividerLabel="or sign in with email" />
      <LoginForm next={next} />

      <div className="flex flex-col items-center gap-2.5">
        <Button
          size="lg"
          className="w-full"
          loading={demo.isPending}
          onClick={() => {
            demo.mutate();
          }}
        >
          {demo.isPending ? null : <CirclePlay aria-hidden />}
          Try the live demo
        </Button>
        <p className="text-center text-xs font-medium text-muted-foreground">
          Read-only demo with real traffic. No account needed.
        </p>
      </div>

      <AuthFooter>
        New here?
        <Link to="/signup" search={{ next }} className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </AuthFooter>
    </AuthLayout>
  );
}
