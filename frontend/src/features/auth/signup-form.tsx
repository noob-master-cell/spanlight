import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi, errorMessage } from "@/lib/api";
import { applyServerFieldErrors } from "@/lib/form-errors";

import { refreshMe } from "./queries";
import { safeNextPath } from "./search";

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

interface SignupFormProps {
  /** The page to land on after signing up, as it came in the URL. */
  next: string | undefined;
}

export function SignupForm({ next }: SignupFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const signup = useMutation({
    // The variables hold the new password: don't keep them in the mutation cache after use.
    gcTime: 0,
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
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={signup.isPending}>
        Create account
      </Button>
    </form>
  );
}
