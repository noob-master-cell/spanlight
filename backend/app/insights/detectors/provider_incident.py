"""`provider_incident`: a provider failing across the organization.

Reads `ctx.org_provider_errors` (the last 30 minutes, every project of the organization,
fault-injected spans already excluded by the engine's query) and the current project's own
llm spans. Per provider it sums `provider_5xx` and `calls` over all projects. It fires when
the provider has at least 20 5xx errors and a share of at least 20 % of its calls, spread over
at least 2 projects or at least 50 errors in one. The finding is emitted into the current
project only when that project had at least one 5xx from the provider itself. Warning;
critical at a share of 50 % or more. Key: `{provider}`. Evidence trace ids are the current
project's own non-fault `provider_5xx` llm spans of the provider in the window.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from app.insights import format as fmt
from app.insights.context import DetectorContext, LlmSpanRow, OrgProviderRow
from app.insights.detectors._evidence import by_key, span_trace_ids
from app.insights.schemas import Evidence, Finding, Severity

KIND = "provider_incident"
WINDOW = timedelta(minutes=30)
MIN_ORG_ERRORS = 20
MIN_ORG_SHARE = Decimal("0.20")
MIN_PROJECTS_AFFECTED = 2
SOLO_PROJECT_MIN_ERRORS = 50
CRITICAL_SHARE = Decimal("0.50")
PROVIDER_5XX = "provider_5xx"


@dataclass(frozen=True, slots=True)
class _ProviderTotals:
    org_errors: int
    calls: int
    projects_affected: int

    @property
    def org_share(self) -> Decimal | None:
        return Decimal(self.org_errors) / Decimal(self.calls) if self.calls > 0 else None


def _totals_by_provider(rows: tuple[OrgProviderRow, ...]) -> dict[str, _ProviderTotals]:
    grouped: dict[str, list[OrgProviderRow]] = defaultdict(list)
    for row in rows:
        grouped[row.provider].append(row)
    return {
        provider: _ProviderTotals(
            org_errors=sum(row.provider_5xx for row in provider_rows),
            calls=sum(row.calls for row in provider_rows),
            projects_affected=sum(1 for row in provider_rows if row.provider_5xx >= 1),
        )
        for provider, provider_rows in grouped.items()
    }


def _is_incident(totals: _ProviderTotals) -> bool:
    share = totals.org_share
    if share is None or totals.org_errors < MIN_ORG_ERRORS or share < MIN_ORG_SHARE:
        return False
    return (
        totals.projects_affected >= MIN_PROJECTS_AFFECTED
        or totals.org_errors >= SOLO_PROJECT_MIN_ERRORS
    )


def _own_failure_trace_ids(ctx: DetectorContext, provider: str) -> list[str]:
    """Distinct traces of this project's non-fault 5xx spans on the provider, newest first."""
    failed: list[LlmSpanRow] = [
        span
        for span in ctx.llm_spans
        if span.provider == provider
        and span.error_class == PROVIDER_5XX
        and span.fault_scenario is None
        and ctx.window.contains(span.started_at)
    ]
    return span_trace_ids(failed)


def _finding(
    ctx: DetectorContext, provider: str, totals: _ProviderTotals, share: Decimal
) -> Finding:
    severity = Severity.CRITICAL if share >= CRITICAL_SHARE else Severity.WARNING
    return Finding(
        kind=KIND,
        severity=severity,
        fingerprint_key=provider,
        evidence=Evidence(
            trace_ids=_own_failure_trace_ids(ctx, provider),
            metrics={
                "org_errors": totals.org_errors,
                "org_share": fmt.round_share(share),
                "projects_affected": totals.projects_affected,
            },
            window=ctx.window,
        ),
        params={
            "provider": fmt.text(provider),
            "org_errors": fmt.count(totals.org_errors),
            "org_share": fmt.rate(share),
            "projects_affected": fmt.count_noun(totals.projects_affected, "project"),
        },
    )


@dataclass(frozen=True, slots=True)
class _ProviderIncident:
    kind: str = KIND
    window: timedelta = WINDOW
    min_samples: int = MIN_ORG_ERRORS

    def run(self, ctx: DetectorContext) -> list[Finding]:
        own_errors = {
            row.provider
            for row in ctx.org_provider_errors
            if row.project_id == ctx.project_id and row.provider_5xx >= 1
        }
        totals = _totals_by_provider(tuple(ctx.org_provider_errors))
        return by_key(
            _finding(ctx, provider, provider_totals, share)
            for provider, provider_totals in totals.items()
            if provider in own_errors
            and _is_incident(provider_totals)
            and (share := provider_totals.org_share) is not None
        )


detector = _ProviderIncident()
