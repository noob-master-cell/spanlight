import { Mail, MessageSquare, Siren, Webhook, type LucideIcon } from "lucide-react";

import type { AlertChannel, AlertChannelKind } from "@/lib/api";

export const KIND_LABELS: Record<AlertChannelKind, string> = {
  email: "Email",
  slack: "Slack",
  webhook: "Webhook",
  pagerduty: "PagerDuty",
};

export const KIND_ICONS: Record<AlertChannelKind, LucideIcon> = {
  email: Mail,
  slack: MessageSquare,
  webhook: Webhook,
  pagerduty: Siren,
};

/** What the row's target cell shows: a main line (mono for addresses) and a muted second line. */
export interface ChannelTarget {
  primary: string;
  secondary: string;
  mono: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Figma "Alerts/Channel row" target cell. Secrets are never shown: Slack shows only its fixed
 * host, PagerDuty only that a key is stored.
 */
export function channelTarget(channel: AlertChannel): ChannelTarget {
  const config = channel.config;
  switch (channel.kind) {
    case "email": {
      const to = "to" in config ? config.to : [];
      const shown = to.slice(0, 2).join(", ");
      const more = to.length > 2 ? ` +${to.length - 2}` : "";
      return {
        primary: to.length === 1 ? "1 recipient" : `${to.length} recipients`,
        secondary: `${shown}${more}`,
        mono: false,
      };
    }
    case "slack":
      return { primary: "hooks.slack.com/…", secondary: "Incoming webhook", mono: true };
    case "webhook":
      return {
        primary: "url" in config ? hostOf(config.url) : "—",
        secondary: "Signed webhook",
        mono: true,
      };
    case "pagerduty":
      return {
        primary: `Severity: ${("severity" in config ? config.severity : "error").toLowerCase()}`,
        secondary: channel.has_secret ? "Routing key stored" : "No routing key stored",
        mono: false,
      };
  }
}

/** Channels grouped by kind, in the frame's order; kinds without channels are left out. */
export function groupByKind(
  channels: readonly AlertChannel[],
): { kind: AlertChannelKind; channels: AlertChannel[] }[] {
  const order: AlertChannelKind[] = ["email", "slack", "webhook", "pagerduty"];
  return order
    .map((kind) => ({ kind, channels: channels.filter((channel) => channel.kind === kind) }))
    .filter((group) => group.channels.length > 0);
}

/** Field copy from the Figma channel dialogs. */
export const CHANNEL_COPY = {
  createTitle: "Add channel",
  description: "Alerts are sent here when a rule fires or resolves.",
  nameHint: "Shown in rules and delivery logs.",
  kindLocked: "A channel's type can't be changed.",
  slackHint: "Starts with https://hooks.slack.com/. Stored encrypted and never shown again.",
  webhookHint:
    "HTTPS only. Spanlight signs every request. You get the signing secret once, after you save.",
  webhookEditHint: "HTTPS only. Spanlight signs every request.",
  routingKeyHint:
    "The 32-character key from your PagerDuty Events API v2 integration. Stored encrypted and never shown again.",
  severityHint: "Sent with every event. Use Critical to page the on-call right away.",
  storedPlaceholder: "Stored. Leave blank to keep it.",
  secretSet: "Set. Shown only once, when created or rotated.",
  notConfiguredTitle: "Encrypted storage isn't set up",
  notConfiguredBody:
    "Slack, webhook and PagerDuty channels need CREDENTIALS_KEYS set on the server. Ask whoever runs Spanlight to set it, or use an email channel.",
  footnote:
    "Slack, webhook and PagerDuty credentials are stored encrypted and are never shown again.",
} as const;
