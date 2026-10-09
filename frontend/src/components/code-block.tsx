import { Fragment } from "react";

import { CopyButton } from "@/components/copy-button";
import { tokenize, type CodeLanguage, type CodeTokenKind } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  /** Accessible name for the code region and the copy button, e.g. "Python SDK: Install". */
  label: string;
  /** File name or heading shown in the header in mono, e.g. "quickstart.py". Defaults to label. */
  title?: string;
  /** Enables light syntax colouring. Defaults to plain text. */
  language?: CodeLanguage;
  className?: string;
}

const TOKEN_CLASSES: Record<CodeTokenKind, string | undefined> = {
  plain: undefined,
  keyword: "text-code-keyword",
  decorator: "text-code-keyword",
  string: "text-code-string",
  comment: "text-code-comment",
  prompt: "text-code-comment select-none",
};

/**
 * Dark code card (Figma "Onboarding/Code card"): ink surface in both themes, window dots,
 * mono title, a "Copy" pill, then 14px mono code with lime strings and fuchsia keywords.
 * Long lines scroll horizontally; the code region is focusable for keyboard scrolling.
 */
export function CodeBlock({ code, label, title, language = "text", className }: CodeBlockProps) {
  const tokens = tokenize(code, language);

  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-tile bg-hero-card text-hero-card-foreground dark:border dark:border-border",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-rail-tile py-2.5 pr-2.5 pl-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex shrink-0 gap-1.5">
            <span className="size-2 rounded-full bg-rail-tile" />
            <span className="size-2 rounded-full bg-rail-tile" />
            <span className="size-2 rounded-full bg-rail-tile" />
          </span>
          <span className="truncate font-mono text-label text-rail-muted-foreground">
            {title ?? label}
          </span>
        </span>
        <CopyButton
          value={code}
          label="Copy"
          aria-label={`Copy ${label}`}
          tone="ink"
          showLabel
          size="sm"
          className="h-auto py-1.5 pr-3 pl-2.5 text-xs font-medium [&_svg]:size-3.5"
        />
      </figcaption>
      {/* Focusable so keyboard users can scroll long lines horizontally. */}
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto px-6 pt-[18px] pb-[22px] font-mono text-code text-rail-foreground focus-visible:outline-offset-[-2px]"
      >
        <code>
          {tokens.map((token, index) => {
            const tokenClass = TOKEN_CLASSES[token.kind];
            return tokenClass ? (
              <span key={index} className={tokenClass}>
                {token.text}
              </span>
            ) : (
              <Fragment key={index}>{token.text}</Fragment>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}
