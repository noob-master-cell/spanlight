/**
 * Column classes shared by the labels and the rows (Figma "Gateway/Key row"). They are container
 * queries on the card: from 52rem the full row sits in columns; below that the facts wrap under
 * the name and the actions stay on its line.
 */
export const KEY_COLUMNS = {
  name: "min-w-0 flex-1 @[52rem]:min-w-[180px]",
  environment: "hidden w-[116px] shrink-0 @[52rem]:block",
  route: "hidden w-[130px] shrink-0 @[52rem]:block",
  limits: "hidden w-[116px] shrink-0 @[52rem]:block",
  cache: "hidden w-[56px] shrink-0 @[52rem]:block",
  lastUsed: "hidden w-[96px] shrink-0 @[52rem]:block",
  action: "flex shrink-0 items-center justify-end @[52rem]:w-[132px]",
} as const;
