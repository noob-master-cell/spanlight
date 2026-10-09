import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Notice } from "@/components/notice";

/** A calm notice that the current role can see but not change this page. */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return <Notice icon={Lock}>{children}</Notice>;
}
