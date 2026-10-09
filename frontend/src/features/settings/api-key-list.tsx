import type { ApiKey } from "@/lib/api";

import { KEY_COLUMNS } from "./api-key-columns";
import { ApiKeyRow } from "./api-key-row";
import type { RevokeAbility } from "./api-key-utils";
import { ColumnLabels, TileList } from "./settings-list";

interface ApiKeyListProps {
  keys: ApiKey[];
  ability: RevokeAbility;
}

/** Figma "Settings/Key row v2" tiles under their column labels. The container query drives the columns. */
export function ApiKeyList({ keys, ability }: ApiKeyListProps) {
  return (
    <div className="@container flex flex-col gap-3">
      <ColumnLabels className="gap-2 pr-3 pl-4 @[38rem]:flex">
        <span className={KEY_COLUMNS.name}>Key</span>
        <span className={KEY_COLUMNS.scopes}>Scopes</span>
        <span className={KEY_COLUMNS.created}>Created</span>
        <span className={KEY_COLUMNS.lastUsed}>Last used</span>
        <span className={KEY_COLUMNS.expires}>Expires</span>
        <span className={KEY_COLUMNS.status}>Status</span>
        <span className="w-[76px] shrink-0" />
      </ColumnLabels>
      <TileList label="API keys">
        {keys.map((key) => (
          <ApiKeyRow key={key.id} apiKey={key} ability={ability} />
        ))}
      </TileList>
    </div>
  );
}
