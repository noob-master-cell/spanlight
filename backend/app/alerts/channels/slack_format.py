"""The Slack message for an alert or an insight, as Block Kit JSON. Pure.

Alert layout: a header, a section of fields, one "Open in Spanlight" button and a context line.
Insight layout: a header, a section with the title, summary and three fields, a "Suggested fix"
section and the button. The top-level `text` is the email subject, which Slack shows in
notifications. Names that people typed (rule, project, organization) and insight copy (which
quotes model, tool and environment names from client traffic) are escaped for mrkdwn so they
cannot add a link or mention.
"""

from datetime import datetime, timedelta
from typing import Any

from app.alerts.formatting import (
    COMPARATOR_SYMBOLS,
    METRIC_LABELS,
    filter_pairs,
    format_duration,
    format_metric_value,
)
from app.alerts.payload import AlertPayload, ChannelTestPayload, InsightPayload
from app.alerts.subject import alert_subject

HEADER_LIMIT = 150  # Slack rejects a header over 150 characters.
SECTION_LIMIT = 3000  # ... a section text over 3000 characters ...
FIELD_LIMIT = 2000  # ... and a field over 2000.
# Escaped lengths of the insight copy inside those limits (the rest is markup and headings).
_TITLE_CHARS = 500
_SUMMARY_CHARS = SECTION_LIMIT - _TITLE_CHARS - 10
_FIX_CHARS = SECTION_LIMIT - 20
_LABEL_CHARS = FIELD_LIMIT - 20
_PERIOD_LABELS = {"monthly": "This month", "daily": "Today"}


def escape_mrkdwn(text: str) -> str:
    """Slack's three control characters; the order matters, `&` first."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_slack(payload: AlertPayload | InsightPayload | ChannelTestPayload) -> dict[str, Any]:
    """The JSON body to POST to the incoming-webhook URL."""
    if isinstance(payload, ChannelTestPayload):
        return _test_message(payload)
    if isinstance(payload, InsightPayload):
        return _insight_message(payload)
    blocks: list[dict[str, Any]] = [
        _header(_header_text(payload)),
        {"type": "section", "fields": _fields(payload)},
        _button(payload.url),
        _context(payload),
    ]
    return {"text": escape_mrkdwn(alert_subject(payload)), "blocks": blocks}


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _escaped_clip(text: str, limit: int) -> str:
    """`text` escaped for mrkdwn in at most `limit` characters. The cut is made in the raw text,
    before escaping, so it never splits an entity such as `&amp;`."""
    escaped = escape_mrkdwn(text)
    if len(escaped) <= limit:
        return escaped
    low, high = 0, len(text)  # the longest raw prefix whose escaped form and "…" fit
    while low < high:
        middle = (low + high + 1) // 2
        if len(escape_mrkdwn(text[:middle])) < limit:
            low = middle
        else:
            high = middle - 1
    return escape_mrkdwn(text[:low]) + "…"


def _header(text: str) -> dict[str, Any]:
    text = _clip(text, HEADER_LIMIT)
    return {"type": "header", "text": {"type": "plain_text", "text": text, "emoji": True}}


def _header_text(payload: AlertPayload) -> str:
    if payload.event == "budget.exceeded" and payload.budget is not None:
        return f"\U0001f4b8 Budget exceeded: {payload.budget.name}"
    if payload.event == "alert.resolved":
        return f"✅ Resolved: {payload.rule.name}"
    return f"\U0001f534 Firing: {payload.rule.name}"


def _field(title: str, value: str) -> dict[str, str]:
    return {"type": "mrkdwn", "text": f"*{title}*\n{value}"}


def _slack_date(moment: datetime) -> str:
    """A date Slack shows in the reader's time zone, with the UTC ISO time as the fallback."""
    iso = moment.strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"<!date^{int(moment.timestamp())}^{{date_short_pretty}} {{time}}|{iso}>"


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
        _field("Since", _slack_date(payload.started_at)),
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


def _insight_message(payload: InsightPayload) -> dict[str, Any]:
    insight = payload.insight
    severity = insight.severity.capitalize()
    title = _escaped_clip(" ".join(insight.title.split()), _TITLE_CHARS)
    text = f"*{title}*\n{_escaped_clip(insight.summary, _SUMMARY_CHARS)}"
    fix = f"*Suggested fix*\n{_escaped_clip(insight.suggested_fix, _FIX_CHARS)}"
    return {
        "text": escape_mrkdwn(alert_subject(payload)),
        "blocks": [
            _header(f"\U0001fa7a {severity} insight in {payload.project.name}"),
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": text},
                "fields": [
                    _field("Kind", _escaped_clip(insight.label, _LABEL_CHARS)),
                    _field("Occurrences", f"{insight.occurrences:,}"),
                    _field("First seen", _slack_date(insight.first_seen_at)),
                ],
            },
            {"type": "section", "text": {"type": "mrkdwn", "text": fix}},
            _button(payload.url),
        ],
    }
