"""The Slack message for an alert, as Block Kit JSON. Pure.

Layout: a header, a section of fields, one "Open in Spanlight" button and a context line. The
top-level `text` is the email subject, which Slack shows in notifications. Names that people
typed (rule, project, organization) are escaped for mrkdwn so they cannot add a link or mention.
"""

from datetime import timedelta
from typing import Any

from app.alerts.formatting import (
    COMPARATOR_SYMBOLS,
    METRIC_LABELS,
    filter_pairs,
    format_duration,
    format_metric_value,
)
from app.alerts.payload import AlertPayload, ChannelTestPayload
from app.alerts.subject import alert_subject

HEADER_LIMIT = 150  # Slack rejects a header over 150 characters.
_PERIOD_LABELS = {"monthly": "This month", "daily": "Today"}


def escape_mrkdwn(text: str) -> str:
    """Slack's three control characters; the order matters, `&` first."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_slack(payload: AlertPayload | ChannelTestPayload) -> dict[str, Any]:
    """The JSON body to POST to the incoming-webhook URL."""
    if isinstance(payload, ChannelTestPayload):
        return _test_message(payload)
    blocks: list[dict[str, Any]] = [
        _header(_header_text(payload)),
        {"type": "section", "fields": _fields(payload)},
        _button(payload.url),
        _context(payload),
    ]
    return {"text": escape_mrkdwn(alert_subject(payload)), "blocks": blocks}


def _header(text: str) -> dict[str, Any]:
    if len(text) > HEADER_LIMIT:
        text = text[: HEADER_LIMIT - 1] + "…"
    return {"type": "header", "text": {"type": "plain_text", "text": text, "emoji": True}}


def _header_text(payload: AlertPayload) -> str:
    if payload.event == "budget.exceeded" and payload.budget is not None:
        return f"\U0001f4b8 Budget exceeded: {payload.budget.name}"
    if payload.event == "alert.resolved":
        return f"✅ Resolved: {payload.rule.name}"
    return f"\U0001f534 Firing: {payload.rule.name}"


def _field(title: str, value: str) -> dict[str, str]:
    return {"type": "mrkdwn", "text": f"*{title}*\n{value}"}


def _fields(payload: AlertPayload) -> list[dict[str, str]]:
    rule = payload.rule
    metric = METRIC_LABELS[rule.metric]
    pairs = filter_pairs(rule.filters)
    if pairs:
        metric += " · " + " · ".join(escape_mrkdwn(pair) for pair in pairs)
    if payload.budget is not None:
        when = _field("Period", _PERIOD_LABELS[payload.budget.period])
    else:
        when = _field("Window", f"{rule.window_minutes} min")
    unix = int(payload.started_at.timestamp())
    iso = payload.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        _field("Project", escape_mrkdwn(payload.project.name)),
        _field("Metric", metric),
        _field("Value", format_metric_value(rule.metric, payload.value)),
        _field(
            "Threshold",
            f"{COMPARATOR_SYMBOLS[rule.comparator]} "
            f"{format_metric_value(rule.metric, payload.threshold)}",
        ),
        when,
        _field("Since", f"<!date^{unix}^{{date_short_pretty}} {{time}}|{iso}>"),
    ]


def _button(url: str) -> dict[str, Any]:
    return {
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Open in Spanlight"},
                "url": url,
            }
        ],
    }


def _context(payload: AlertPayload) -> dict[str, Any]:
    text = f"Spanlight · {escape_mrkdwn(payload.org.name)}"
    if payload.event == "alert.resolved" and payload.resolved_at is not None:
        lasted: timedelta = payload.resolved_at - payload.started_at
        text += f" · Firing for {format_duration(lasted)}"
    return {"type": "context", "elements": [{"type": "mrkdwn", "text": text}]}


def _test_message(payload: ChannelTestPayload) -> dict[str, Any]:
    org = escape_mrkdwn(payload.org.name)
    return {
        "text": escape_mrkdwn(alert_subject(payload)),
        "blocks": [
            _header("\U0001f514 Test from Spanlight"),
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"If you can read this, Slack alerts work for {org}.",
                },
            },
            _button(payload.url),
            {"type": "context", "elements": [{"type": "mrkdwn", "text": f"Spanlight · {org}"}]},
        ],
    }
