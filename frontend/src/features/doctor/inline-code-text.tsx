import { splitInlineCode } from "./insight-format";

/**
 * Catalogue copy with `code` spans set in mono. The text is rendered as text nodes only: nothing
 * in it is ever parsed as markup.
 */
export function InlineCodeText({ text }: { text: string }) {
  return (
    <>
      {splitInlineCode(text).map((part, index) =>
        part.code ? (
          <code
            key={index}
            className="rounded-sm bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]"
          >
            {part.text}
          </code>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
