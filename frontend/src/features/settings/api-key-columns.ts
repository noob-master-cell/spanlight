/**
 * Column classes shared by the API key labels and rows, so they line up. Widths are the Figma
 * "Settings/Key row v2" (key 136, scopes 196, created 98, last used 90, expires 92, status 70,
 * action 76). They are container queries on the card: from 38rem the scopes, expiry and revoke
 * action sit in columns, from 52rem the full row. Below that the details stack under the name.
 */
export const KEY_COLUMNS = {
  name: "min-w-0 flex-1 @[52rem]:min-w-[136px]",
  scopes: "hidden w-[150px] shrink-0 flex-wrap items-center gap-1 @[38rem]:flex @[52rem]:w-[196px]",
  created: "hidden w-[98px] shrink-0 @[52rem]:block",
  lastUsed: "hidden w-[90px] shrink-0 @[52rem]:block",
  expires: "hidden w-24 shrink-0 @[38rem]:block @[52rem]:w-[92px]",
  status: "hidden w-[70px] shrink-0 @[52rem]:block",
  action: "flex h-8 w-[76px] shrink-0 items-center justify-end",
} as const;
