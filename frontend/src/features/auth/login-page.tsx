import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { CirclePlay } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi, errorMessage, isApiError } from "@/lib/api";

import { AuthLayout } from "./auth-layout";
import { refreshMe } from "./queries";
import { safeNextPath } from "./search";
import { useDemoSession } from "./use-demo-session";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof loginSchema>;

const routeApi = getRouteApi("/login");

export function LoginPage() {
  const { next } = routeApi.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const demo = useDemoSession();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: async () => {
      await refreshMe(queryClient);
      await navigate({ href: safeNextPath(next) ?? "/" });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 429) {
        setFormError("Too many sign-in attempts. Wait 15 minutes and try again.");
        return;
      }
      setFormError(errorMessage(error));
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    login.mutate(values);
  });

  return (
    <AuthLayout
      title="Welcome"
      accent="back."
      description="Observe your LLM calls, costs and errors."
      footer={
        <>
          New here?
          <Link
            to="/signup"
            search={{ next }}
            className="font-semibold text-accent hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-4">
          <FormField label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
          </FormField>
          <FormField label="Password" error={form.formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </FormField>
        </div>

        {formError ? (
          <Notice tone="danger" role="alert">
            {formError}
          </Notice>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={login.isPending}>
          Sign in
        </Button>
      </form>

      <div
        className="flex items-center gap-3 text-xs font-medium text-muted-foreground"
        aria-hidden
      >
        <span className="h-px flex-1 bg-border-strong" />
        or
        <span className="h-px flex-1 bg-border-strong" />
      </div>

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
    </AuthLayout>
  );
}
