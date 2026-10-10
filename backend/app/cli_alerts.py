"""`spanlight alerts ...`: administrative commands for alert rules and budgets."""

import asyncio
import dataclasses
import json
import sys
from typing import Annotated

import typer

from app.alerts.cli_support import EvaluationReport, evaluate_once
from app.config import get_settings
from app.core.logging import configure_logging

alerts_app = typer.Typer(help="Alert rules and budgets.", no_args_is_help=True)


def _report_text(report: EvaluationReport) -> str:
    lines = [
        f"Evaluated {report.rules} rules in {report.projects} projects in {report.seconds:.2f} s.",
        f"  ok: {report.ok}",
        f"  no_data: {report.no_data}",
        f"  error: {report.errors}",
        f"Transitions: {report.transitions}",
    ]
    if report.projects_failed:
        lines.append(f"Projects that could not be read: {report.projects_failed} (see the log)")
    if report.dry_run:
        lines.append("Dry run: every change was rolled back.")
    return "\n".join(lines)


@alerts_app.command("evaluate")
def alerts_evaluate(
    dry_run: Annotated[
        bool,
        typer.Option(
            "--dry-run", help="Evaluate, then roll every change back (holds rule locks to the end)."
        ),
    ] = False,
    as_json: Annotated[bool, typer.Option("--json", help="Print one JSON object.")] = False,
) -> None:
    """Run one alert evaluation pass over every project now, as the worker's job would.

    A real pass is not a preview: it writes each rule's state, opens and resolves events, and
    queues the notifications of every transition in the outbox, which the worker then delivers.
    While the worker's own pass runs, the two split the rules between them, so turn
    ALERTS_EVALUATION_ENABLED off first when you time a pass.

    With --dry-run the work is the same but all of it is rolled back at the end, so nothing is
    kept and nothing is queued. It does this in one long transaction, so every rule it evaluates
    stays row-locked until the end: the worker's pass skips those rules for that minute and an
    edit of a rule waits. Run it when that is acceptable, with the worker's evaluation off, or
    against a copy of the database.

    Logs go to stderr, so stdout carries only the result. Prints the rules evaluated by outcome,
    the transitions and the seconds; exits non-zero when a rule or a project failed.
    """
    settings = get_settings()
    configure_logging(settings.log_level, json=settings.log_json, stream=sys.stderr)
    report = asyncio.run(evaluate_once(settings, dry_run=dry_run))
    if as_json:
        typer.echo(json.dumps(dataclasses.asdict(report)))
    else:
        typer.echo(_report_text(report))
    if report.failed:
        typer.echo("Error: some rules or projects failed; see the log", err=True)
        raise typer.Exit(code=1)
