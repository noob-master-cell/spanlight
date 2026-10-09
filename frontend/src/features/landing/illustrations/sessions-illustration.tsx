import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A three-turn conversation replayed as chat (Figma "Illo/Sessions"). */
export function SessionsIllustration() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between pb-1">
        <span className="font-mono text-xs text-subtle-foreground">session · chat-123</span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          3 turns
        </span>
      </div>
      <Bubble from="user">Where’s my order? It was due Monday.</Bubble>
      <Bubble from="assistant">
        It shipped Tuesday and should arrive Friday. Want the tracking link?
      </Bubble>
      <div className="flex flex-wrap gap-1.5">
        <MetaPill>1.42 s</MetaPill>
        <MetaPill>$0.0031</MetaPill>
        <MetaPill mono>claude-haiku-4-5</MetaPill>
      </div>
      <Bubble from="user">Yes, please.</Bubble>
    </div>
  );
}

function Bubble({ from, children }: { from: "user" | "assistant"; children: ReactNode }) {
  const user = from === "user";
  return (
    <div className={cn("flex", user && "justify-end")}>
      <p
        className={cn(
          "max-w-[244px] rounded-2xl px-[15px] py-[11px] text-sm",
          user
            ? "rounded-br-[6px] bg-hero-card text-hero-card-foreground dark:border dark:border-border"
            : "rounded-bl-[6px] bg-surface-muted text-foreground",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function MetaPill({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border border-border bg-surface px-[11px] py-[5px] text-muted-foreground",
        mono ? "font-mono text-2xs leading-[1.5]" : "text-xs font-medium",
      )}
    >
      {children}
    </span>
  );
}
