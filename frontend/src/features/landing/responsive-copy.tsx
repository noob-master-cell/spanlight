/** Copy that the mobile design shortens: one variant below 768px, the other above. */
export interface ResponsiveText {
  mobile: string;
  desktop: string;
}

export type Copy = string | ResponsiveText;

/**
 * Renders a string as is, or the mobile and desktop variants of a phrase with CSS toggles.
 * Hidden variants are `display: none`, so screen readers only ever read the visible one.
 */
export function ResponsiveCopy({ copy }: { copy: Copy }) {
  if (typeof copy === "string") {
    return copy;
  }
  return (
    <>
      <span className="md:hidden">{copy.mobile}</span>
      <span className="hidden md:inline">{copy.desktop}</span>
    </>
  );
}
