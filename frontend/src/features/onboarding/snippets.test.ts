import { describe, expect, it } from "vitest";

import { API_KEY_PLACEHOLDER, buildSnippets, type Snippet, type SnippetId } from "./snippets";

const HOST = "https://spanlight.example.com";
const SECRET = "spl_live_abc123";

function snippet(snippets: Snippet[], id: SnippetId): string {
  const found = snippets.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`missing snippet ${id}`);
  }
  return found.blocks.map((block) => block.code).join("\n");
}

describe("buildSnippets", () => {
  it("returns the five tabs in order", () => {
    const snippets = buildSnippets({ apiKey: null, host: HOST });
    expect(snippets.map((item) => item.label)).toEqual([
      "Python SDK",
      "OpenAI",
      "Anthropic",
      "OpenTelemetry",
      "curl",
    ]);
  });

  it("names each code card like a file", () => {
    const snippets = buildSnippets({ apiKey: null, host: HOST });
    const python = snippets.find((item) => item.id === "python");
    expect(python?.blocks.map((block) => block.filename)).toEqual(["terminal", "quickstart.py"]);
    expect(snippets.find((item) => item.id === "curl")?.blocks[0]?.filename).toBe("terminal");
  });

  it("uses the placeholder when no key was created", () => {
    const snippets = buildSnippets({ apiKey: null, host: HOST });
    for (const item of snippets) {
      expect(snippet(snippets, item.id)).toContain(API_KEY_PLACEHOLDER);
    }
  });

  it("inserts the real secret and host everywhere", () => {
    const snippets = buildSnippets({ apiKey: SECRET, host: HOST });
    for (const item of snippets) {
      const code = snippet(snippets, item.id);
      expect(code).toContain(SECRET);
      expect(code).toContain(HOST);
      expect(code).not.toContain(API_KEY_PLACEHOLDER);
    }
  });

  it("strips trailing slashes from the host", () => {
    const snippets = buildSnippets({ apiKey: SECRET, host: `${HOST}/` });
    expect(snippet(snippets, "curl")).toContain(`"${HOST}/v1/traces"`);
  });

  it("initialises the Python SDK with the exported names", () => {
    const snippets = buildSnippets({ apiKey: SECRET, host: HOST });
    const python = snippet(snippets, "python");
    expect(python).toContain("pip install spanlight");
    expect(python).toContain("from spanlight import observe");
    expect(python).toContain("@observe()");
    expect(python).toContain(`api_key="${SECRET}"`);
    expect(python).toContain(`host="${HOST}"`);
    expect(python).toContain('environment="production"');

    expect(snippet(snippets, "openai")).toContain("client = wrap_openai(OpenAI())");
    expect(snippet(snippets, "anthropic")).toContain("client = wrap_anthropic(Anthropic())");
  });

  it("configures the OTLP exporter for this instance", () => {
    const otel = snippet(buildSnippets({ apiKey: SECRET, host: HOST }), "otel");
    expect(otel).toContain(`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${HOST}/v1/otlp/traces"`);
    expect(otel).toContain(`OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer%20${SECRET}"`);
    expect(otel).toContain('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL="http/protobuf"');
  });

  it("sends a span body that matches the ingestion contract", () => {
    const curl = snippet(buildSnippets({ apiKey: SECRET, host: HOST }), "curl");
    expect(curl).toContain(`-H "Authorization: Bearer ${SECRET}"`);
    expect(curl).toContain("$(openssl rand -hex 16)");
    expect(curl).toContain("$(openssl rand -hex 8)");
    expect(curl).toContain("date -u");

    // The heredoc body, with shell variables substituted, must be valid JSON.
    const body = /<<EOF\n([\s\S]*)\nEOF$/.exec(curl)?.[1];
    expect(body).toBeDefined();
    const json = (body ?? "")
      .replace("$TRACE_ID", "0".repeat(32))
      .replace("$SPAN_ID", "0".repeat(16))
      .replaceAll("$NOW", "2026-10-07T12:00:00Z");
    const parsed = JSON.parse(json) as { spans: Record<string, unknown>[] };
    expect(parsed.spans).toHaveLength(1);
    expect(parsed.spans[0]).toMatchObject({
      kind: "llm",
      status: "ok",
      provider: "openai",
      model: "gpt-4o-mini",
      trace: { environment: "production" },
    });
  });

  it("honours a custom environment", () => {
    const snippets = buildSnippets({ apiKey: null, host: HOST, environment: "staging" });
    expect(snippet(snippets, "python")).toContain('environment="staging"');
    expect(snippet(snippets, "otel")).toContain("deployment.environment.name=staging");
  });
});
