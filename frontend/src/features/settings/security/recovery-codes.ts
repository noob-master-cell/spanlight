/** A set is ten codes; the server issues exactly this many. */
export const RECOVERY_CODE_TOTAL = 10;

export const RECOVERY_CODES_FILENAME = "spanlight-recovery-codes.txt";

export interface NumberedCode {
  /** "01" … "10", as drawn beside the code. */
  position: string;
  code: string;
}

/** The codes as two numbered columns, the first half in the left one (Figma "Recovery codes"). */
export function numberedColumns(codes: readonly string[]): [NumberedCode[], NumberedCode[]] {
  const numbered = codes.map((code, index) => ({
    position: String(index + 1).padStart(2, "0"),
    code,
  }));
  const half = Math.ceil(numbered.length / 2);
  return [numbered.slice(0, half), numbered.slice(half)];
}

/** What "Copy" puts on the clipboard: one code per line, nothing else. */
export function recoveryCodesClipboardText(codes: readonly string[]): string {
  return codes.join("\n");
}

/**
 * The file "Download" saves: a short header, then the numbered codes. Plain text, so any editor or
 * password manager can hold it.
 */
export function recoveryCodesFileText(
  codes: readonly string[],
  account: string,
  createdOn: string | null,
): string {
  const header = [
    "Spanlight recovery codes",
    `Account: ${account}`,
    ...(createdOn ? [`Created: ${createdOn}`] : []),
    "",
    "Each code works once. Store them somewhere safe; we won't show them again.",
    "",
  ];
  const [left, right] = numberedColumns(codes);
  const lines = [...left, ...right].map(({ position, code }) => `${position}  ${code}`);
  return [...header, ...lines, ""].join("\n");
}
