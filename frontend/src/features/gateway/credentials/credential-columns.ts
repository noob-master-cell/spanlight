/**
 * Column classes shared by the credential labels and rows so they line up. From 44rem of card
 * width the base URL, last use and check sit in columns; below that they stack under the name
 * (Figma "Gateway/Credential tile (mobile)"), with the actions in a row of their own.
 */
export const CREDENTIAL_COLUMNS = {
  name: "min-w-0 @[44rem]:w-[200px] @[44rem]:flex-none",
  baseUrl: "hidden min-w-0 flex-1 @[44rem]:block",
  lastUsed: "hidden w-[100px] shrink-0 @[44rem]:block",
  check: "hidden w-[220px] min-w-0 shrink-0 @[44rem]:block",
  actions: "flex items-center justify-between gap-1.5 @[44rem]:shrink-0 @[44rem]:justify-end",
} as const;
