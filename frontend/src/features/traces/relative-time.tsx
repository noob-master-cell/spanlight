import { Tooltip } from "@/components/ui/tooltip";
import { formatRelativeTime, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

/** "5 minutes ago", with the absolute local time in a tooltip and the <time> element. */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const relative = formatRelativeTime(iso);
  const absolute = formatTimestamp(iso);
  if (relative === null || absolute === null) {
    return <span className={cn("text-subtle-foreground", className)}>Invalid date</span>;
  }
  return (
    <Tooltip content={absolute}>
      <time dateTime={iso} title={absolute} className={cn("tabular", className)}>
        {relative}
      </time>
    </Tooltip>
  );
}
