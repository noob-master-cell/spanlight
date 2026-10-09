import { Lock } from "lucide-react";

import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";

interface ReadOnlySlugFieldProps {
  slug: string;
  /** Where the slug is used, e.g. "Read-only. Used in URLs and can't be changed." */
  hint: string;
}

/** The slug of a project or an organization: mono, muted and locked (Figma "Slug field"). */
export function ReadOnlySlugField({ slug, hint }: ReadOnlySlugFieldProps) {
  return (
    <FormField
      label="Slug"
      hint={
        <span className="inline-flex items-center gap-1.5">
          <Lock aria-hidden className="size-3 shrink-0" />
          {hint}
        </span>
      }
    >
      <Input
        readOnly
        value={slug}
        className="border-border bg-surface-muted font-mono text-label text-muted-foreground focus-visible:border-border"
      />
    </FormField>
  );
}
