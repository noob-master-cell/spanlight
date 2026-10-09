/** Initial avatars: a stable tint per person and the letter shown inside. Pure functions only. */

export type AvatarTone = "violet" | "success" | "warning" | "danger" | "neutral";

const TONES: readonly AvatarTone[] = ["violet", "success", "warning", "danger", "neutral"];

/** The same seed (a user ID) always gets the same tint, on every settings page. */
export function avatarTone(seed: string): AvatarTone {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) % 1_000_003;
  }
  return TONES[hash % TONES.length] ?? "violet";
}

/** The first letter of a name or email, uppercased; "?" when there is none. */
export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase("en-US") : "?";
}
