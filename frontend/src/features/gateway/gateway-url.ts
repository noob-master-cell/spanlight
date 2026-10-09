/**
 * The URL apps send their provider calls to: this instance's own address plus `/gw/v1`. It is read
 * from the browser's location, so it is right behind any proxy.
 */
export function gatewayBaseUrl(origin: string = window.location.origin): string {
  return `${origin}/gw/v1`;
}

/** The Anthropic SDK adds `/v1` itself, so it gets the gateway's address without it. */
export function gatewayAnthropicBaseUrl(origin: string = window.location.origin): string {
  return `${origin}/gw`;
}
