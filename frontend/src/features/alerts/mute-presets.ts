import { untilLabel } from "./alert-time";

export type MutePresetId = "1h" | "8h" | "24h" | "forever";

export interface MutePreset {
  id: MutePresetId;
  label: string;
  /** How long the mute lasts. */
  durationMs: number;
}

const HOUR_MS = 3_600_000;

/** The server's ceiling for a mute: at most 30 days ahead. */
export const MAX_MUTE_MS = 30 * 24 * HOUR_MS;

/*
 * "Until I unmute" is stored as the longest mute the server allows. A few minutes come off so a
 * browser clock slightly ahead of the server's, or a slow request, never lands past the
 * 30-day limit and gets a 422.
 */
const CLOCK_MARGIN_MS = 5 * 60_000;

const PRESETS_BY_ID: Record<MutePresetId, MutePreset> = {
  "1h": { id: "1h", label: "1 hour", durationMs: HOUR_MS },
  "8h": { id: "8h", label: "8 hours", durationMs: 8 * HOUR_MS },
  "24h": { id: "24h", label: "24 hours", durationMs: 24 * HOUR_MS },
  forever: { id: "forever", label: "Until I unmute", durationMs: MAX_MUTE_MS - CLOCK_MARGIN_MS },
};

/** Spec copy, in order: "1 hour", "8 hours", "24 hours", "Until I unmute". */
export const MUTE_PRESETS: readonly MutePreset[] = [
  PRESETS_BY_ID["1h"],
  PRESETS_BY_ID["8h"],
  PRESETS_BY_ID["24h"],
  PRESETS_BY_ID.forever,
];

export const DEFAULT_MUTE_PRESET: MutePresetId = "8h";

export function presetById(id: MutePresetId): MutePreset {
  return PRESETS_BY_ID[id];
}

export function isMutePresetId(value: string): value is MutePresetId {
  return Object.hasOwn(PRESETS_BY_ID, value);
}

/** When a mute chosen now ends. */
export function muteEnd(preset: MutePreset, now: Date): Date {
  return new Date(now.getTime() + preset.durationMs);
}

/** The helper line under a preset: "Until 15:36", "Until tomorrow, 14:36", "Until Nov 9, 2026". */
export function presetHint(preset: MutePreset, now: Date): string {
  return `Until ${untilLabel(muteEnd(preset, now), now, preset.id === "forever")}`;
}
