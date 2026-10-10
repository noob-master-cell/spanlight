/**
 * Figma "Budgets — List" column widths, applied from the container width where the list turns
 * into columns. Shared by the overline labels and the rows so they line up.
 */
export const BUDGET_COLUMNS = {
  name: "min-w-0 @[56rem]:w-[230px] @[56rem]:shrink-0",
  scope: "min-w-0 @[56rem]:w-[150px] @[56rem]:shrink-0",
  period: "@[56rem]:w-[70px] @[56rem]:shrink-0",
  spend: "min-w-0 @[56rem]:w-[240px] @[56rem]:shrink-0",
  resets: "@[56rem]:w-[150px] @[56rem]:shrink-0",
} as const;
