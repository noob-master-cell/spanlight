"""Registry of background task handlers, keyed by job kind."""

from app.backups.jobs import run_backup_database
from app.exports.jobs import run_create_export
from app.exports.purge import PURGE_JOB, run_purge_project_objects
from app.jobs.context import TaskHandler
from app.jobs.tasks.cleanup import run_cleanup_sessions
from app.jobs.tasks.demo_traffic import run_demo_traffic
from app.jobs.tasks.retention import run_retention
from app.notifications.jobs import run_deliver_notifications
from app.rollups.jobs import run_rollup_hourly

TASKS: dict[str, TaskHandler] = {
    "retention": run_retention,
    "cleanup_sessions": run_cleanup_sessions,
    "deliver_notifications": run_deliver_notifications,
    "demo_traffic": run_demo_traffic,
    "rollup_hourly": run_rollup_hourly,
    "backup_database": run_backup_database,
    "create_export": run_create_export,
    PURGE_JOB: run_purge_project_objects,
}
