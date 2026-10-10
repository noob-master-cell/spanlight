"""The one-line title of an alert: email subject, Slack fallback text, PagerDuty summary."""

from app.alerts.payload import AlertPayload, ChannelTestPayload

TEST_SUBJECT = "Test notification from Spanlight"


def subject_safe(text: str) -> str:
    """One line: every run of whitespace, line breaks included, becomes a single space.

    Names are user text and may hold a line break; an email subject must not (SMTP refuses it,
    and a refused row would be retried until it fails).
    """
    return " ".join(text.split())


def alert_subject(payload: AlertPayload | ChannelTestPayload) -> str:
    if isinstance(payload, ChannelTestPayload):
        return TEST_SUBJECT
    if payload.event == "budget.exceeded" and payload.budget is not None:
        return subject_safe(f"[Budget] {payload.budget.name} exceeded · {payload.project.name}")
    label = "Resolved" if payload.event == "alert.resolved" else "Firing"
    return subject_safe(f"[{label}] {payload.rule.name} · {payload.project.name}")
