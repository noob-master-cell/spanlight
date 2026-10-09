import { Badge, type BadgeProps } from "@/components/ui/badge";

import { environmentTone } from "./environment";

interface EnvironmentBadgeProps {
  environment: string;
  /** `sm` in dense rows and lists, `md` in the overview table. */
  size?: BadgeProps["size"];
}

/**
 * Figma "Gateway/Environment badge": a pill with a dot, production ink, staging amber,
 * development violet, demo lime; any other environment is neutral.
 */
export function EnvironmentBadge({ environment, size = "sm" }: EnvironmentBadgeProps) {
  return (
    <Badge variant={environmentTone(environment)} size={size} className="max-w-full gap-1.5">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{environment}</span>
    </Badge>
  );
}
