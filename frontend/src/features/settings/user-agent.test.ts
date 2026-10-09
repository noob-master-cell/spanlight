import { describe, expect, it } from "vitest";

import { describeUserAgent } from "./user-agent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("describeUserAgent", () => {
  it.each([
    [CHROME_MAC, "Chrome on macOS", false],
    [SAFARI_MAC, "Safari on macOS", false],
    [SAFARI_IPHONE, "Safari on iOS", true],
    [CHROME_IPHONE, "Chrome on iOS", true],
    [FIREFOX_WINDOWS, "Firefox on Windows", false],
    [EDGE_WINDOWS, "Edge on Windows", false],
    [CHROME_ANDROID, "Chrome on Android", true],
    [FIREFOX_LINUX, "Firefox on Linux", false],
  ])("describes %s", (userAgent, label, mobile) => {
    expect(describeUserAgent(userAgent)).toEqual({ label, mobile });
  });

  it("names command-line clients", () => {
    expect(describeUserAgent("curl/8.4.0").label).toBe("curl");
    expect(describeUserAgent("python-httpx/0.27.0").label).toBe("Python");
  });

  it("falls back to Unknown device", () => {
    expect(describeUserAgent(null).label).toBe("Unknown device");
    expect(describeUserAgent("").label).toBe("Unknown device");
    expect(describeUserAgent("SomethingElse/1.0").label).toBe("Unknown device");
  });
});
