import { formatRelativeTime, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

/** "3 hours ago", with the exact timestamp on hover and in the machine-readable attribute. */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const relative = formatRelativeTime(iso);
  const absolute = formatTimestamp(iso);
  return (
    <time dateTime={iso} title={absolute ?? undefined} className={cn("tabular", className)}>
      {relative ?? absolute ?? iso}
    </time>
  );
}
