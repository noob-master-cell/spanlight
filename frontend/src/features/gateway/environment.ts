/*
 * Gateway key environments, in one place: the presets the key form offers, the production test
 * the backend applies, the badge tone of each preset and the error code for a fault profile on a
 * production key.
 */

/** Environments offered first; the key form accepts any other text too. */
export const ENVIRONMENT_PRESETS = ["production", "staging", "development", "demo"] as const;

export type EnvironmentKind = (typeof ENVIRONMENT_PRESETS)[number] | "other";

/** The same test as the backend's `is_production_environment`: ignore case and spaces. */
export function isProductionEnvironment(environment: string): boolean {
  return environment.trim().toLowerCase() === "production";
}

/** Which preset an environment is, or `other` for a custom value. */
export function environmentKind(environment: string): EnvironmentKind {
  const normalized = environment.trim().toLowerCase();
  return ENVIRONMENT_PRESETS.find((preset) => preset === normalized) ?? "other";
}

export type EnvironmentTone = "ink" | "warning" | "accent" | "lime" | "neutral";

const ENVIRONMENT_TONES: Record<EnvironmentKind, EnvironmentTone> = {
  production: "ink",
  staging: "warning",
  development: "accent",
  demo: "lime",
  other: "neutral",
};

/** Badge colour of a key's environment; any other name is neutral. */
export function environmentTone(environment: string): EnvironmentTone {
  return ENVIRONMENT_TONES[environmentKind(environment)];
}

/** The API's answer when a fault profile meets a production key, from either side. */
export const PRODUCTION_KEY_CODE = "FAULT_PROFILE_ON_PRODUCTION_KEY";
