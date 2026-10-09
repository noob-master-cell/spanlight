import { describe, expect, it } from "vitest";

import { tokenize, type CodeToken } from "./highlight";

function kindsOf(tokens: CodeToken[]): [string, string][] {
  return tokens.filter((token) => token.kind !== "plain").map((token) => [token.kind, token.text]);
}

describe("tokenize", () => {
  it("highlights python keywords, strings, decorators and comments", () => {
    const code = [
      "import spanlight",
      'spanlight.init(environment="production")  # reads SPANLIGHT_API_KEY',
      "@spanlight.observe()",
      "def answer_ticket(question: str) -> str: ...",
    ].join("\n");

    expect(kindsOf(tokenize(code, "python"))).toEqual([
      ["keyword", "import"],
      ["string", '"production"'],
      ["comment", "# reads SPANLIGHT_API_KEY"],
      ["decorator", "@spanlight.observe"],
      ["keyword", "def"],
    ]);
  });

  it("keeps every character, in order", () => {
    const code = 'curl -H "Authorization: Bearer x" https://host/v1/traces#frag';
    expect(
      tokenize(code, "shell")
        .map((token) => token.text)
        .join(""),
    ).toBe(code);
  });

  it("does not treat a # inside a URL as a shell comment", () => {
    const tokens = tokenize("$ open https://example.com/#docs # note", "shell");
    expect(kindsOf(tokens)).toEqual([
      ["prompt", "$"],
      ["comment", "# note"],
    ]);
  });

  it("does not colour keywords inside strings", () => {
    expect(kindsOf(tokenize('print("import this")', "python"))).toEqual([
      ["string", '"import this"'],
    ]);
  });

  it("returns plain text for unknown languages", () => {
    expect(tokenize("anything", "text")).toEqual([{ kind: "plain", text: "anything" }]);
  });
});
