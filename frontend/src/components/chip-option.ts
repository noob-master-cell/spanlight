import type { ReactNode } from "react";

export interface ChipOption {
  value: string;
  /** The option's main line in the list, and its chip text unless `chip` is set. */
  label: string;
  /** A muted second line, e.g. the member's email. */
  detail?: string;
  /** What the chip says once picked, e.g. the address rather than the name. */
  chip?: string;
  /** An avatar or icon before the text. */
  leading?: ReactNode;
  /** Makes the option unpickable and shows this badge, e.g. "Not verified". */
  disabledNote?: string;
  /** A picked value the server refused: its chip is drawn in the error style. */
  invalid?: boolean;
}

/** The DOM id of the option at `index`, for the input's aria-activedescendant. */
export function optionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}
