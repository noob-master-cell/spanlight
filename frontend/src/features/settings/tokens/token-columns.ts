/**
 * Column classes shared by the token labels, rows and loading rows, so they line up. Widths are
 * the Figma "Settings/Token row" (name 184, scope 80, created 104, last used 100, expires 110,
 * status 80, action 76). They are container queries on the card: from 38rem the scope, expiry and
 * revoke action sit in columns, from 52rem the full row. Below that the details stack under the name.
 */
export const TOKEN_COLUMNS = {
  name: "min-w-0 flex-1 @[52rem]:min-w-[184px]",
  scope: "hidden w-[72px] shrink-0 @[38rem]:block @[52rem]:w-20",
  created: "hidden w-[104px] shrink-0 @[52rem]:block",
  lastUsed: "hidden w-[100px] shrink-0 @[52rem]:block",
  expires: "hidden w-[104px] shrink-0 @[38rem]:block @[52rem]:w-[110px]",
  status: "hidden w-20 shrink-0 @[52rem]:block",
  action: "flex h-8 w-[76px] shrink-0 items-center justify-end",
} as const;
