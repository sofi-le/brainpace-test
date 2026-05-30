"""Day-window helpers for querying the AWEAR API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def day_window(date_str: str | None, tz_name: str) -> tuple[str, str, str]:
    """Return (start_iso, end_iso, date_label) for the given day in `tz_name`.

    Defaults to today. `end` is capped at 'now' if the day is today, otherwise
    the full 24h window is used. Timestamps are returned as UTC ISO 8601.
    """
    tz = ZoneInfo(tz_name)
    now = datetime.now(tz)
    if date_str:
        day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
    else:
        day = now
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    next_day = start + timedelta(days=1)
    end = min(now, next_day) if start.date() == now.date() else next_day
    start_utc = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_utc = end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return start_utc, end_utc, start.strftime("%Y-%m-%d")


def recent_window(
    minutes: int, tz_name: str, delay_seconds: int = 0
) -> tuple[str, str]:
    """Return (start_iso, end_iso) for a `minutes`-wide recent window.

    Used for "current state" live views where the app polls for the most recent
    slice of signal. `delay_seconds` shifts the window back so it lands on data
    that has actually arrived (AWEAR ingests with a lag): the window covers
    [now - delay - minutes, now - delay]. Timestamps are returned as UTC ISO.
    """
    tz = ZoneInfo(tz_name)
    now = datetime.now(tz).replace(microsecond=0)
    end = now - timedelta(seconds=delay_seconds)
    start = end - timedelta(minutes=minutes)
    start_utc = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_utc = end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return start_utc, end_utc


def _hms(clock: str) -> tuple[int, int, int]:
    """Parse an 'HH:MM:SS' clock string into (hour, minute, second)."""
    hour, minute, second = (int(part) for part in clock.split(":"))
    return hour, minute, second


def clock_window(
    start_clock: str, end_clock: str, date_str: str | None, tz_name: str
) -> tuple[str, str]:
    """Return (start_iso, end_iso) for a fixed clock-time window on one day.

    `start_clock`/`end_clock` are 'HH:MM:SS' wall-clock times in `tz_name` on
    `date_str` (default: today). Used to pin a fixed calibration/baseline slice
    of signal (e.g. the tiredness FTR baseline). Timestamps are returned as UTC
    ISO 8601, matching `day_window`/`recent_window`.
    """
    tz = ZoneInfo(tz_name)
    if date_str:
        day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
    else:
        day = datetime.now(tz)
    sh, sm, ss = _hms(start_clock)
    eh, em, es = _hms(end_clock)
    start = day.replace(hour=sh, minute=sm, second=ss, microsecond=0)
    end = day.replace(hour=eh, minute=em, second=es, microsecond=0)
    start_utc = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_utc = end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return start_utc, end_utc


_DURATION_UNITS = {"s": 1, "m": 60, "h": 3600}


def parse_duration(value: str) -> int:
    """Parse a short duration like '30s', '1m', '5m', '1h' into seconds.

    A bare number is treated as seconds. Raises ValueError on malformed or
    non-positive input so routes can surface a 422.
    """
    s = value.strip().lower()
    if not s:
        raise ValueError("empty duration")
    if s[-1] in _DURATION_UNITS:
        number, mult = s[:-1], _DURATION_UNITS[s[-1]]
    else:
        number, mult = s, 1
    try:
        n = int(number)
    except ValueError as exc:
        raise ValueError(f"invalid duration {value!r}") from exc
    if n <= 0:
        raise ValueError(f"duration must be positive: {value!r}")
    return n * mult
