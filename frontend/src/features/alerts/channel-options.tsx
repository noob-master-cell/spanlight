import type { ChipOption } from "@/components/chip-multi-select";
import type { AlertChannel } from "@/lib/api";

import { KIND_ICONS, KIND_LABELS } from "./channel-kinds";

const DELETED_LABEL = "Deleted channel";

/**
 * The org's channels as picker options with their kind icon. A picked id that is no longer a
 * channel (deleted since the rule was saved, or refused by the server) is drawn as an error chip.
 */
export function channelOptions(
  channels: readonly AlertChannel[],
  picked: readonly string[],
  refused: readonly string[],
): ChipOption[] {
  const known = new Set(channels.map((channel) => channel.id));
  const options: ChipOption[] = channels.map((channel) => {
    const Icon = KIND_ICONS[channel.kind];
    return {
      value: channel.id,
      label: channel.name,
      detail: KIND_LABELS[channel.kind],
      leading: <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
      invalid: refused.includes(channel.id),
    };
  });
  for (const id of picked) {
    if (!known.has(id)) {
      options.push({ value: id, label: DELETED_LABEL, disabledNote: "Deleted", invalid: true });
    }
  }
  return options;
}
