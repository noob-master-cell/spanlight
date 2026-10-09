/**
 * Integration snippets for the "How it works" code card. Lines are pre-split into coloured
 * segments (Figma "Code card": keywords and literals muted, SDK calls and strings lime) so
 * the card renders exactly as designed; `codeToText` rebuilds the plain text for copying.
 *
 * Snippets use the real Python SDK API (`sdks/python`, imported as `spanlight`).
 */

export type CodeTone = "plain" | "muted" | "accent";

export interface CodeSegment {
  text: string;
  tone: CodeTone;
}

export type CodeLine = readonly CodeSegment[];

export type CodeSampleId = "python" | "openai" | "otlp" | "gateway";

export interface CodeSample {
  id: CodeSampleId;
  label: string;
  /** Accessible name of the code region. */
  description: string;
  lines: readonly CodeLine[];
  /** Shorter version for phones; falls back to `lines`. */
  compactLines?: readonly CodeLine[];
}

/** Template tag: `code\`${muted("import")} spanlight\`` → segments. */
function code(strings: TemplateStringsArray, ...segments: CodeSegment[]): CodeLine {
  const line: CodeSegment[] = [];
  strings.forEach((text, index) => {
    if (text) {
      line.push({ text, tone: "plain" });
    }
    const segment = segments[index];
    if (segment) {
      line.push(segment);
    }
  });
  return line;
}

function muted(text: string): CodeSegment {
  return { text, tone: "muted" };
}

function accent(text: string): CodeSegment {
  return { text, tone: "accent" };
}

const BLANK: CodeLine = [];

export const API_KEY_PLACEHOLDER = "<YOUR_API_KEY>";

const PYTHON_LINES: readonly CodeLine[] = [
  code`${muted("import")} spanlight`,
  code`${muted("from")} anthropic ${muted("import")} Anthropic`,
  BLANK,
  code`spanlight.${accent("init")}(environment=${accent('"production"')})`,
  code`client = spanlight.${accent("wrap_anthropic")}(Anthropic())`,
  BLANK,
  code`${accent("@spanlight.observe")}(name=${accent('"answer_ticket"')})`,
  code`${muted("def")} answer_ticket(ticket_id: ${muted("str")}, question: ${muted("str")}) -> ${muted("str")}:`,
  code`    spanlight.${accent("update_trace")}(session_id=ticket_id)`,
  code`    reply = client.messages.${accent("create")}(`,
  code`        model=${accent('"claude-haiku-4-5"')},`,
  code`        max_tokens=${muted("512")},`,
  code`        messages=[{${accent('"role"')}: ${accent('"user"')}, ${accent('"content"')}: question}],`,
  code`    )`,
  code`    ${muted("return")} reply.content[0].text`,
];

const PYTHON_COMPACT_LINES: readonly CodeLine[] = [
  code`${muted("import")} spanlight`,
  code`${muted("from")} anthropic ${muted("import")} Anthropic`,
  BLANK,
  code`spanlight.${accent("init")}()`,
  code`client = spanlight.${accent("wrap_anthropic")}(`,
  code`    Anthropic()`,
  code`)`,
];

const OPENAI_LINES: readonly CodeLine[] = [
  code`${muted("import")} spanlight`,
  code`${muted("from")} openai ${muted("import")} OpenAI`,
  BLANK,
  code`spanlight.${accent("init")}(environment=${accent('"production"')})`,
  code`client = spanlight.${accent("wrap_openai")}(OpenAI())`,
  BLANK,
  code`${accent("@spanlight.observe")}(name=${accent('"answer_ticket"')})`,
  code`${muted("def")} answer_ticket(ticket_id: ${muted("str")}, question: ${muted("str")}) -> ${muted("str")}:`,
  code`    spanlight.${accent("update_trace")}(session_id=ticket_id)`,
  code`    response = client.chat.completions.${accent("create")}(`,
  code`        model=${accent('"gpt-4.1-mini"')},`,
  code`        messages=[{${accent('"role"')}: ${accent('"user"')}, ${accent('"content"')}: question}],`,
  code`    )`,
  code`    ${muted("return")} response.choices[0].message.content ${muted("or")} ${accent('""')}`,
];

const OPENAI_COMPACT_LINES: readonly CodeLine[] = [
  code`${muted("import")} spanlight`,
  code`${muted("from")} openai ${muted("import")} OpenAI`,
  BLANK,
  code`spanlight.${accent("init")}()`,
  code`client = spanlight.${accent("wrap_openai")}(`,
  code`    OpenAI()`,
  code`)`,
];

const OTLP_LINES: readonly CodeLine[] = [
  code`${muted("# Any OpenTelemetry SDK, in any language")}`,
  code`${muted("export")} OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${accent('"http://localhost:8080/v1/otlp/traces"')}`,
  code`${muted("export")} OTEL_EXPORTER_OTLP_TRACES_HEADERS=${accent(`"Authorization=Bearer%20${API_KEY_PLACEHOLDER}"`)}`,
  code`${muted("export")} OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=${accent('"http/protobuf"')}`,
  code`${muted("export")} OTEL_SERVICE_NAME=${accent('"support-copilot"')}`,
];

const GATEWAY_KEY_PLACEHOLDER = "<YOUR_GATEWAY_KEY>";

const GATEWAY_LINES: readonly CodeLine[] = [
  code`${muted("# No SDK: point your existing client at the gateway")}`,
  code`${muted("from")} openai ${muted("import")} OpenAI`,
  BLANK,
  code`client = ${accent("OpenAI")}(`,
  code`    base_url=${accent('"http://localhost:8080/gw/v1"')},`,
  code`    api_key=${accent(`"${GATEWAY_KEY_PLACEHOLDER}"`)},`,
  code`)`,
  BLANK,
  code`response = client.chat.completions.${accent("create")}(`,
  code`    model=${accent('"gpt-4.1-mini"')},`,
  code`    messages=[{${accent('"role"')}: ${accent('"user"')}, ${accent('"content"')}: ${accent('"Say hello"')}}],`,
  code`)`,
];

const GATEWAY_COMPACT_LINES: readonly CodeLine[] = [
  code`${muted("from")} openai ${muted("import")} OpenAI`,
  BLANK,
  code`client = ${accent("OpenAI")}(`,
  code`    base_url=${accent('"…/gw/v1"')},`,
  code`    api_key=${accent('"<YOUR_GATEWAY_KEY>"')},`,
  code`)`,
];

export const CODE_SAMPLES: Record<CodeSampleId, CodeSample> = {
  python: {
    id: "python",
    label: "Python",
    description: "Python SDK with the Anthropic client",
    lines: PYTHON_LINES,
    compactLines: PYTHON_COMPACT_LINES,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "Python SDK with the OpenAI client",
    lines: OPENAI_LINES,
    compactLines: OPENAI_COMPACT_LINES,
  },
  otlp: {
    id: "otlp",
    label: "OTLP",
    description: "OpenTelemetry exporter environment",
    lines: OTLP_LINES,
  },
  gateway: {
    id: "gateway",
    label: "Gateway",
    description: "OpenAI client pointed at the Spanlight gateway, no SDK",
    lines: GATEWAY_LINES,
    compactLines: GATEWAY_COMPACT_LINES,
  },
};

/** Tab order. */
export const CODE_SAMPLE_IDS: readonly CodeSampleId[] = ["python", "openai", "otlp", "gateway"];

export function isCodeSampleId(value: string): value is CodeSampleId {
  return Object.hasOwn(CODE_SAMPLES, value);
}

/** The lines to show: the compact variant on phones when there is one. */
export function visibleLines(sample: CodeSample, compact: boolean): readonly CodeLine[] {
  return compact && sample.compactLines ? sample.compactLines : sample.lines;
}

/** Plain text of the given lines, as it should land on the clipboard. */
export function codeToText(lines: readonly CodeLine[]): string {
  return lines.map((line) => line.map((segment) => segment.text).join("")).join("\n");
}
