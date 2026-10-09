import { tokenize, type CodeLanguage, type CodeToken } from "@/lib/highlight";

/** A block of an integration snippet, as built by the onboarding snippets. */
export interface SnippetSource {
  language: CodeLanguage;
  code: string;
}

/**
 * Splits highlighted tokens into lines so each line can carry a line number. A token that
 * spans a newline (e.g. a multi-line string) is cut at the line break.
 */
export function splitTokensIntoLines(tokens: readonly CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const pieces = token.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (piece !== "") {
        lines[lines.length - 1]?.push({ kind: token.kind, text: piece });
      }
    });
  }
  return lines;
}

/**
 * Joins snippet blocks into one numbered listing, separated by a blank line. One-line shell
 * commands get a "$ " prompt (highlighted as a prompt, so it is not mistaken for code).
 */
export function snippetLines(blocks: readonly SnippetSource[]): CodeToken[][] {
  const lines: CodeToken[][] = [];
  blocks.forEach((block, index) => {
    if (index > 0) {
      lines.push([]);
    }
    const isOneLineCommand = block.language === "shell" && !block.code.includes("\n");
    const code = isOneLineCommand ? `$ ${block.code}` : block.code;
    lines.push(...splitTokensIntoLines(tokenize(code, block.language)));
  });
  return lines;
}
