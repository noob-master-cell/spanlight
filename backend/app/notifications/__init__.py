"""Notifications: the transactional outbox and the registry of deliverers.

Producers import `enqueue` and `NotificationKind`; process startup registers deliverers with
`register`; the worker's `deliver_notifications` job (see `jobs.py`) does the sending.
"""

from app.notifications.outbox import NotificationKind, enqueue
from app.notifications.registry import Deliverer, register

__all__ = ["Deliverer", "NotificationKind", "enqueue", "register"]
