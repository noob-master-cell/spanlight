import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi, errorMessage, isApiError } from "@/lib/api";

import { holdChallenge, releaseChallenge } from "./login-challenge";
import { nextLoginStep, postLoginDestination, TWO_FACTOR_PATH } from "./login-flow";
import { refreshMe } from "./queries";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof loginSchema>;

interface LoginFormProps {
  /** The page to land on after signing in, as it came in the URL. */
  next: string | undefined;
}

/** Email and password. A correct password either signs in or hands over to the code step. */
export function LoginForm({ next }: LoginFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // A sign-in that was left half done (a challenge nobody answered) is over once this shows again.
  useEffect(() => {
    releaseChallenge();
  }, []);

  const login = useMutation({
    // The answer can carry a sign-in challenge: don't keep it in the mutation cache after use.
    gcTime: 0,
    mutationFn: authApi.login,
    onSuccess: async (result) => {
      const step = nextLoginStep(result);
      if (step.kind === "two-factor") {
        // No one is signed in yet. The challenge stays in memory; only the safe `next` is in the URL.
        holdChallenge({ token: step.challenge });
        await navigate({ to: TWO_FACTOR_PATH, search: { next } });
        return;
      }
      await refreshMe(queryClient);
      await navigate({ href: postLoginDestination(next) });
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
    releaseChallenge();
    login.mutate(values);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-4">
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
        </FormField>
        <FormField
          label="Password"
          error={form.formState.errors.password?.message}
          labelAction={
            <Link
              to="/forgot-password"
              className="rounded-sm text-label font-semibold text-accent hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <Input type="password" autoComplete="current-password" {...form.register("password")} />
        </FormField>
      </div>

      {formError ? (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={login.isPending}>
        Sign in
      </Button>
    </form>
  );
}
