from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Hashable

_RECENT_LOG_KEYS: dict[Hashable, float] = {}
_LOOKUP_SUMMARIES: dict[Hashable, 'LookupSummaryState'] = {}
_LOCK = threading.Lock()
_MAX_KEYS = 10000
_DEFAULT_MAX_SAMPLES = 10


@dataclass
class LookupSummaryState:
    count: int = 0
    sample_conversation_ids: list[str] = field(default_factory=list)
    sample_user_ids: list[str] = field(default_factory=list)
    last_emitted_at: float = 0.0


def should_emit_deduped_log(key: Hashable, ttl_seconds: float = 300.0) -> bool:
    """Return True if this log key has not been emitted recently."""
    now = time.monotonic()
    with _LOCK:
        last_seen = _RECENT_LOG_KEYS.get(key)
        if last_seen is not None and now - last_seen < ttl_seconds:
            return False

        _RECENT_LOG_KEYS[key] = now

        if len(_RECENT_LOG_KEYS) > _MAX_KEYS:
            cutoff = now - ttl_seconds
            stale_keys = [
                existing_key
                for existing_key, existing_last_seen in _RECENT_LOG_KEYS.items()
                if existing_last_seen < cutoff
            ]
            for stale_key in stale_keys:
                _RECENT_LOG_KEYS.pop(stale_key, None)

        return True


def record_periodic_lookup_summary(
    key: Hashable,
    conversation_id: str,
    user_id: str | None = None,
    flush_interval_seconds: float = 60.0,
    max_samples: int = _DEFAULT_MAX_SAMPLES,
) -> dict[str, Any] | None:
    """Aggregate frequent lookup activity and return a periodic summary payload."""
    now = time.monotonic()
    with _LOCK:
        summary = _LOOKUP_SUMMARIES.get(key)
        if summary is None:
            summary = LookupSummaryState(last_emitted_at=now)
            _LOOKUP_SUMMARIES[key] = summary

        summary.count += 1
        if (
            conversation_id not in summary.sample_conversation_ids
            and len(summary.sample_conversation_ids) < max_samples
        ):
            summary.sample_conversation_ids.append(conversation_id)
        if (
            user_id
            and user_id not in summary.sample_user_ids
            and len(summary.sample_user_ids) < max_samples
        ):
            summary.sample_user_ids.append(user_id)

        if now - summary.last_emitted_at < flush_interval_seconds:
            return None

        payload: dict[str, Any] = {
            'lookup_count': summary.count,
            'sample_conversation_ids': summary.sample_conversation_ids.copy(),
        }
        if summary.sample_user_ids:
            payload['sample_user_ids'] = summary.sample_user_ids.copy()

        summary.count = 0
        summary.sample_conversation_ids.clear()
        summary.sample_user_ids.clear()
        summary.last_emitted_at = now
        return payload
