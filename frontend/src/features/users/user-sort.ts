import type { UserListQuery, UserSort } from "@/lib/api";

import type { UsersSearch } from "./search";

export const USER_PAGE_SIZE = 50;

/** The sortable columns in the order they appear, with their header and phone-menu labels. */
export const SORT_COLUMNS: readonly { sort: UserSort; label: string }[] = [
  { sort: "traces", label: "Traces" },
  { sort: "errors", label: "Errors" },
  { sort: "cost", label: "Cost" },
];

/** Footer wording for the active sort. The API always sorts descending, unknowns last. */
const SORT_PHRASES: Record<UserSort, string> = {
  cost: "sorted by cost, unpriced last",
  errors: "sorted by errors",
  traces: "sorted by traces",
};

export function sortPhrase(sort: UserSort): string {
  return SORT_PHRASES[sort];
}

/** Search params after choosing a sort column: the window and environment params are kept. */
export function withSort<T extends UsersSearch>(search: T, sort: UserSort): T {
  return { ...search, sort };
}

/** `aria-sort` of a sortable column header: only the active column is ordered. */
export function ariaSortFor(column: UserSort, active: UserSort): "descending" | "none" {
  return column === active ? "descending" : "none";
}

/** Maps the URL sort and the resolved time range onto the list endpoint's query. */
export function toUserListQuery(
  sort: UserSort,
  window: { from: string; to: string },
): Omit<UserListQuery, "cursor"> {
  return { from: window.from, to: window.to, sort, limit: USER_PAGE_SIZE };
}

/** The window params every project page shares; kept when moving between the list and a user. */
export function keepWindow(previous: {
  range?: UsersSearch["range"];
  from?: string | undefined;
  to?: string | undefined;
  env?: string | undefined;
}): Pick<UsersSearch, "range" | "from" | "to" | "env"> {
  return { range: previous.range, from: previous.from, to: previous.to, env: previous.env };
}

/*
 * The list's sort from the last visit, so "Back to users" on the detail page returns to the same
 * order. In memory only, like the traces list's remembered search.
 */
let lastSort: UserSort | null = null;

export function rememberUsersSort(sort: UserSort): void {
  lastSort = sort;
}

export function recallUsersSort(): UserSort | undefined {
  return lastSort ?? undefined;
}
