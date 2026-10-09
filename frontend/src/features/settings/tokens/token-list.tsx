import { ColumnLabels, TileList, TileListSkeleton } from "@/components/tile-list";
import type { PersonalAccessToken } from "@/lib/api";

import { TOKEN_COLUMNS } from "./token-columns";
import { TokenRow } from "./token-row";

interface TokenListProps {
  tokens: readonly PersonalAccessToken[];
}

/** Figma "Tokens" rows under their column labels. The container query drives the columns. */
export function TokenList({ tokens }: TokenListProps) {
  return (
    <div className="@container flex flex-col gap-3">
      <TokenColumnLabels />
      <TileList label="Personal access tokens">
        {tokens.map((token) => (
          <TokenRow key={token.id} token={token} />
        ))}
      </TileList>
    </div>
  );
}

/** The labels with three shimmering rows, while the tokens load (Figma "Tokens — loading"). */
export function TokenListSkeleton() {
  return (
    <div className="@container flex flex-col gap-3">
      <TokenColumnLabels />
      <TileListSkeleton label="Loading tokens" rows={3} className="h-[58px]" />
    </div>
  );
}

function TokenColumnLabels() {
  return (
    <ColumnLabels className="pr-3 pl-4 @[38rem]:flex">
      <span className={TOKEN_COLUMNS.name}>Name</span>
      <span className={TOKEN_COLUMNS.scope}>Scope</span>
      <span className={TOKEN_COLUMNS.created}>Created</span>
      <span className={TOKEN_COLUMNS.lastUsed}>Last used</span>
      <span className={TOKEN_COLUMNS.expires}>Expires</span>
      <span className={TOKEN_COLUMNS.status}>Status</span>
      <span className="w-[76px] shrink-0" />
    </ColumnLabels>
  );
}
