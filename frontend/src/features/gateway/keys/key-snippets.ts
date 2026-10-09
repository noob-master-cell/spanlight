import { gatewayAnthropicBaseUrl, gatewayBaseUrl } from "../gateway-url";

export type SdkChoice = "openai" | "anthropic";

/** The lines that point an SDK at the gateway with the key in the environment, not in code. */
export function sdkSnippet(sdk: SdkChoice): string {
  if (sdk === "openai") {
    return [
      "client = OpenAI(",
      `    base_url="${gatewayBaseUrl()}",`,
      '    api_key=os.environ["SPANLIGHT_GATEWAY_KEY"],',
      ")",
    ].join("\n");
  }
  return [
    "client = Anthropic(",
    `    base_url="${gatewayAnthropicBaseUrl()}",`,
    '    api_key=os.environ["SPANLIGHT_GATEWAY_KEY"],',
    ")",
  ].join("\n");
}
