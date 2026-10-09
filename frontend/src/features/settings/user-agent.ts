export interface DeviceDescription {
  /** e.g. "Chrome on macOS", "Safari on iOS", "curl", or "Unknown device". */
  label: string;
  mobile: boolean;
}

export const UNKNOWN_DEVICE = "Unknown device";

/** Order matters: Edge and Opera include "Chrome", Chrome includes "Safari". */
const BROWSERS: { name: string; pattern: RegExp }[] = [
  { name: "Edge", pattern: /\bEdg(?:e|A|iOS)?\// },
  { name: "Opera", pattern: /\b(?:OPR|Opera)\// },
  { name: "Samsung Internet", pattern: /\bSamsungBrowser\// },
  { name: "Firefox", pattern: /\b(?:Firefox|FxiOS)\// },
  { name: "Chrome", pattern: /\b(?:Chrome|CriOS|Chromium)\// },
  { name: "Safari", pattern: /\bVersion\/[\d.]+.*\bSafari\// },
];

const OPERATING_SYSTEMS: { name: string; pattern: RegExp; mobile: boolean }[] = [
  { name: "iOS", pattern: /\b(?:iPhone|iPad|iPod)\b/, mobile: true },
  { name: "Android", pattern: /\bAndroid\b/, mobile: true },
  { name: "ChromeOS", pattern: /\bCrOS\b/, mobile: false },
  { name: "Windows", pattern: /\bWindows\b/, mobile: false },
  { name: "macOS", pattern: /\bMac OS X\b|\bMacintosh\b/, mobile: false },
  { name: "Linux", pattern: /\bLinux\b/, mobile: false },
];

/** Command-line and library clients that call the API directly, e.g. "curl/8.4.0". */
const CLIENTS: { name: string; pattern: RegExp }[] = [
  { name: "curl", pattern: /^curl\// },
  { name: "HTTPie", pattern: /^HTTPie\// },
  { name: "Python", pattern: /^(?:python-requests|python-httpx|Python-urllib)\// },
  { name: "Node.js", pattern: /^(?:node-fetch|undici|axios)\b/ },
  { name: "Playwright", pattern: /\bPlaywright\b|HeadlessChrome\// },
];

/** Turns a raw User-Agent header into a short label for the sessions list. */
export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  const ua = userAgent?.trim() ?? "";
  if (ua === "") {
    return { label: UNKNOWN_DEVICE, mobile: false };
  }

  const client = CLIENTS.find((candidate) => candidate.pattern.test(ua));
  if (client) {
    return { label: client.name, mobile: false };
  }

  const browser = BROWSERS.find((candidate) => candidate.pattern.test(ua));
  const os = OPERATING_SYSTEMS.find((candidate) => candidate.pattern.test(ua));
  const mobile = os?.mobile ?? /\bMobi/.test(ua);

  if (browser && os) {
    return { label: `${browser.name} on ${os.name}`, mobile };
  }
  if (browser) {
    return { label: browser.name, mobile };
  }
  if (os) {
    return { label: os.name, mobile };
  }
  return { label: UNKNOWN_DEVICE, mobile: false };
}
