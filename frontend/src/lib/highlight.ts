/**
 * A deliberately small syntax highlighter for the integration snippets shown in dark code
 * blocks. It colours comments, strings, keywords, decorators and shell prompts; everything
 * else stays plain. It never produces HTML: callers render tokens as text nodes.
 */

export type CodeLanguage = "python" | "shell" | "javascript" | "text";
export type CodeTokenKind = "plain" | "keyword" | "string" | "comment" | "decorator" | "prompt";

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const STRING = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;

const PYTHON_KEYWORDS = [
  "and",
  "as",
  "async",
  "await",
  "class",
  "def",
  "else",
  "False",
  "for",
  "from",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "not",
  "or",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
];

const JAVASCRIPT_KEYWORDS = [
  "async",
  "await",
  "const",
  "export",
  "false",
  "from",
  "function",
  "import",
  "let",
  "new",
  "null",
  "return",
  "true",
];

const SHELL_KEYWORDS = ["export"];

interface LanguageRules {
  comment: string;
  keywords: string[];
  decorator: boolean;
  prompt: boolean;
}

const RULES: Record<Exclude<CodeLanguage, "text">, LanguageRules> = {
  python: { comment: "#[^\\n]*", keywords: PYTHON_KEYWORDS, decorator: true, prompt: false },
  // A shell comment starts a word: "#" inside a URL is not a comment.
  shell: {
    comment: "(?<=^|\\s)#[^\\n]*",
    keywords: SHELL_KEYWORDS,
    decorator: false,
    prompt: true,
  },
  javascript: {
    comment: "\\/\\/[^\\n]*",
    keywords: JAVASCRIPT_KEYWORDS,
    decorator: false,
    prompt: false,
  },
};

function buildPattern(rules: LanguageRules): RegExp {
  const parts = [`(?<comment>${rules.comment})`, `(?<string>${STRING})`];
  if (rules.decorator) {
    parts.push(String.raw`(?<decorator>@[A-Za-z_][\w.]*)`);
  }
  if (rules.prompt) {
    parts.push(String.raw`(?<prompt>^\$(?= ))`);
  }
  parts.push(`(?<keyword>\\b(?:${rules.keywords.join("|")})\\b)`);
  return new RegExp(parts.join("|"), "gm");
}

const TOKEN_KINDS: readonly CodeTokenKind[] = [
  "comment",
  "string",
  "decorator",
  "prompt",
  "keyword",
];

export function tokenize(code: string, language: CodeLanguage): CodeToken[] {
  if (language === "text") {
    return [{ kind: "plain", text: code }];
  }

  const pattern = buildPattern(RULES[language]);
  const tokens: CodeToken[] = [];
  let cursor = 0;

  for (const match of code.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push({ kind: "plain", text: code.slice(cursor, start) });
    }
    const kind = TOKEN_KINDS.find((name) => match.groups?.[name] !== undefined) ?? "plain";
    tokens.push({ kind, text: match[0] });
    cursor = start + match[0].length;
  }

  if (cursor < code.length) {
    tokens.push({ kind: "plain", text: code.slice(cursor) });
  }
  return tokens;
}
