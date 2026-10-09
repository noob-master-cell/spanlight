import { describe, expect, it } from "vitest";

import { classifyPayload, isCutPayload, PAYLOAD_LIMIT_BYTES, payloadHint } from "./payload-format";

describe("classifyPayload", () => {
  it("treats null and undefined as empty", () => {
    expect(classifyPayload(null)).toEqual({ format: "empty" });
    expect(classifyPayload(undefined)).toEqual({ format: "empty" });
  });

  it("recognises chat transcripts", () => {
    const content = classifyPayload([{ role: "user", content: "Hello from Playwright" }]);
    expect(content.format).toBe("chat");
    expect(payloadHint(content)).toBe("1 message");
  });

  it("falls back to text for strings and JSON for other values", () => {
    const text = classifyPayload("plain prompt");
    expect(text).toEqual({ format: "text", text: "plain prompt" });
    expect(payloadHint(text)).toBe("Text");

    const json = classifyPayload({ order_id: "48213" });
    expect(json).toEqual({ format: "json", value: { order_id: "48213" } });
    expect(payloadHint(json)).toBe("JSON");
  });

  it("counts several messages", () => {
    const content = classifyPayload({
      system: "Be brief.",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(payloadHint(content)).toBe("2 messages");
  });
});

describe("isCutPayload", () => {
  const cut = `[{"role":"user","content":"${"x".repeat(PAYLOAD_LIMIT_BYTES)}`.slice(
    0,
    PAYLOAD_LIMIT_BYTES,
  );

  it("flags the limit-sized string preview of a truncated span", () => {
    expect(isCutPayload(cut, true)).toBe(true);
  });

  it("allows for a multi-byte character dropped at the cut", () => {
    expect(isCutPayload(cut.slice(0, PAYLOAD_LIMIT_BYTES - 3), true)).toBe(true);
    expect(isCutPayload(cut.slice(0, PAYLOAD_LIMIT_BYTES - 4), true)).toBe(false);
  });

  it("ignores the other, intact payload and spans that weren't truncated", () => {
    expect(isCutPayload("Summary: a short answer.", true)).toBe(false);
    expect(isCutPayload({ role: "assistant", content: "Hi" }, true)).toBe(false);
    expect(isCutPayload(cut, false)).toBe(false);
  });
});
