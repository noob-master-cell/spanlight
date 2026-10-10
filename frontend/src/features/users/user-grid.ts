import { cn } from "@/lib/utils";

/*
 * Figma "Users/Table row": columns appear as the card (a size container) gets wider, so the
 * table never scrolls sideways. Hidden cells don't take a grid slot, so each template lists
 * only the visible columns.
 *   base   user · traces · errors · cost · last seen · chevron
 *   @3xl   + LLM calls
 *   @4xl   + tokens
 */
export const USER_GRID = cn(
  "grid items-center gap-2.5 px-3",
  "grid-cols-[minmax(0,1fr)_76px_76px_96px_88px_16px]",
  "@3xl:grid-cols-[minmax(0,1fr)_76px_88px_76px_96px_88px_16px]",
  "@4xl:grid-cols-[minmax(0,1fr)_76px_88px_76px_96px_96px_88px_16px]",
);
export const SHOW_CALLS = "hidden @3xl:block";
export const SHOW_TOKENS = "hidden @4xl:block";

export const NO_USER_PRICE = "No price for the models this user called.";
