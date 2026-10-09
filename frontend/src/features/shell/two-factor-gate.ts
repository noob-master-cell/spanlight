import { type UseQueryResult } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { isTwoFactorRequired } from "@/lib/api";

/**
 * Settings pages about the person, not the organization: they only call `/auth/*`, which stays open
 * so a member can turn two-factor authentication on. Everything else is locked until they do.
 */
const ACCOUNT_SETTINGS_PATH = /\/settings\/(account|security|tokens)(\/|$)/;

const SECURITY_PATH = /\/settings\/security(\/|$)/;

export function isAccountSettingsPath(pathname: string): boolean {
  return ACCOUNT_SETTINGS_PATH.test(pathname);
}

/** Whether the page on screen is Security, where the 2FA card asks for the same verification. */
export function useOnSecurityPath(): boolean {
  return useLocation({ select: (location) => SECURITY_PATH.test(location.pathname) });
}

/** Whether the page on screen is one of the account settings, which need no project data. */
export function useOnAccountSettingsPath(): boolean {
  return useLocation({ select: (location) => isAccountSettingsPath(location.pathname) });
}

/**
 * Whether the organization answered `403 TWO_FACTOR_REQUIRED` to the shell's project query: its
 * pages are locked for this person until they turn two-factor authentication on, wherever they are.
 */
export function isBlockedByTwoFactor(project: UseQueryResult): boolean {
  return project.isError && isTwoFactorRequired(project.error);
}

/**
 * Whether the organization's pages should give way to the "turn on two-factor" card. The shell's
 * project query is the one place that reads `403 TWO_FACTOR_REQUIRED` (the query client refreshes it
 * when any other query meets that error, see `createQueryClient`), so no page handles it itself.
 *
 * Account settings stay open. When the person leaves them, the project is asked for again, because
 * that is where they could have turned two-factor on; if it still fails, the card comes back.
 */
export function useTwoFactorGate(project: UseQueryResult): boolean {
  const pathname = useLocation({ select: (location) => location.pathname });
  const required = isBlockedByTwoFactor(project);
  const { refetch } = project;

  const previousPath = useRef(pathname);
  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (required && isAccountSettingsPath(previous) && !isAccountSettingsPath(pathname)) {
      void refetch();
    }
  }, [pathname, required, refetch]);

  return required && !isAccountSettingsPath(pathname);
}
