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
import { authApi, errorMessage } from "@/lib/api";
import { applyServerFieldErrors } from "@/lib/form-errors";

import { AuthLayout } from "./auth-layout";
import { refreshMe } from "./queries";
import { safeNextPath } from "./search";
import { useDemoSession } from "./use-demo-session";

const MIN_PASSWORD_LENGTH = 10;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use at most 100 characters."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(256, "Use at most 256 characters."),
});

type SignupValues = z.infer<typeof signupSchema>;

const SIGNUP_FIELDS = ["name", "email", "password"] as const;

const routeApi = getRouteApi("/signup");

export function SignupPage() {
  const { next } = routeApi.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const demo = useDemoSession();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const signup = useMutation({
    mutationFn: authApi.signup,
    onSuccess: async () => {
      await refreshMe(queryClient);
      const destination = safeNextPath(next);
      if (destination) {
        await navigate({ href: destination });
      } else {
        await navigate({ to: "/onboarding", search: {} });
      }
    },
    onError: (error) => {
      if (!applyServerFieldErrors(error, form.setError, SIGNUP_FIELDS)) {
        setFormError(errorMessage(error));
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    signup.mutate(values);
  });

  return (
    <AuthLayout
      title="Create an"
      accent="account."
      description="Start sending traces in a couple of minutes."
      footer={
        <>
          Already have an account?
          <Link to="/login" search={{ next }} className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-4">
          <FormField label="Name" error={form.formState.errors.name?.message}>
            <Input autoComplete="name" autoFocus {...form.register("name")} />
          </FormField>
          <FormField label="Work email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </FormField>
          <FormField
            label="Password"
            error={form.formState.errors.password?.message}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          >
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </FormField>
        </div>

        {formError ? (
          <Notice tone="danger" role="alert">
            {formError}
          </Notice>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={signup.isPending}>
          Create account
        </Button>
      </form>

      <Button
        variant="ghost"
        className="self-center"
        loading={demo.isPending}
        onClick={() => {
          demo.mutate();
        }}
      >
        {demo.isPending ? null : <CirclePlay aria-hidden />}
        Or try the live demo first
      </Button>
    </AuthLayout>
  );
}
