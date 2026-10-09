import { cn } from "@/lib/utils";

interface ScopeTagProps {
  /** The exact scope string, e.g. "ingest:write" or "read". */
  scope: string;
  className?: string;
}

/** Figma "Settings/Scope tag": a mono hairline pill naming one scope. */
export function ScopeTag({ scope, className }: ScopeTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface px-1.5 py-0.5 font-mono text-xs leading-[1.4] whitespace-nowrap text-foreground",
        className,
      )}
    >
      {scope}
    </span>
  );
}
