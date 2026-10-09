import type { Membership, Project } from "@/lib/api";

import type { OnboardingSearch } from "./search";

export type OnboardingStepId = "org" | "project" | "connect";

export const ONBOARDING_STEPS: readonly { id: OnboardingStepId; label: string }[] = [
  { id: "org", label: "Organization" },
  { id: "project", label: "Project" },
  { id: "connect", label: "Connect" },
];

export type OnboardingState =
  | { step: "org"; notice: string | null }
  | { step: "project"; membership: Membership; notice: string | null }
  | { step: "connect"; membership: Membership; project: Project }
  /** The project list for the org is still loading, so step 3 can't be verified yet. */
  | { step: "loading" };

interface ResolveInput {
  search: OnboardingSearch;
  memberships: readonly Membership[];
  /** Projects of `search.org`, or undefined while they load. */
  projects: readonly Project[] | undefined;
}

/**
 * Works out which wizard step to show from the URL. The URL is only a hint:
 * the org must be one of the user's memberships and the project must belong
 * to it, otherwise we fall back to the earlier step with an explanation.
 */
export function resolveOnboardingState({
  search,
  memberships,
  projects,
}: ResolveInput): OnboardingState {
  if (!search.org) {
    return { step: "org", notice: null };
  }

  const membership = memberships.find((candidate) => candidate.org.id === search.org);
  if (!membership) {
    return {
      step: "org",
      notice: "You don't have access to that organization. Create one or pick another.",
    };
  }

  if (!search.project) {
    return { step: "project", membership, notice: null };
  }

  if (projects === undefined) {
    return { step: "loading" };
  }

  const project = projects.find((candidate) => candidate.id === search.project);
  if (!project) {
    return {
      step: "project",
      membership,
      notice: "That project doesn't exist in this organization. Create a new one to continue.",
    };
  }

  return { step: "connect", membership, project };
}

export function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((candidate) => candidate.id === step);
}

/** How far the user has got: the current step, or "complete" once the first trace arrived. */
export type OnboardingProgress = OnboardingStepId | "complete";

export type StepStatus = "done" | "current" | "upcoming";

/** The status of one step pill for the given progress. */
export function stepStatus(step: OnboardingStepId, progress: OnboardingProgress): StepStatus {
  if (progress === "complete") {
    return "done";
  }
  const index = stepIndex(step);
  const currentIndex = stepIndex(progress);
  if (index < currentIndex) {
    return "done";
  }
  return index === currentIndex ? "current" : "upcoming";
}
