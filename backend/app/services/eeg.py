"""EEG service: glue between the AWEAR client and the signal/analysis layers.

Used by the live API routes and (later) by the batch script, so the
pull -> band-power pipeline lives in exactly one place.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from app.clients.awear import AwearClient
from app.core.cache import cache_get, cache_set
from app.core.config import get_settings
from app.core.timewindow import day_window, recent_window
from app.signal.bands import aggregate_band_powers, band_powers, split_bands


async def participant_band_powers(
    client: AwearClient,
    participant_id: str,
    date: str | None,
    tz: str,
) -> tuple[dict[str, float], int]:
    """Fetch a participant's records for a day and return (band_powers, n_records).

    Result is cached in the local SQLite TTL cache (see config.cache_ttl_seconds)
    so repeated demo polls of /summary, /mood and /tiredness don't re-pull a full
    day from AWEAR each time.
    """
    settings = get_settings()
    ttl = settings.cache_ttl_seconds
    key = f"bandpowers:{participant_id}:{date or 'today'}:{tz}"
    if ttl > 0:
        hit = cache_get(key)
        if hit is not None:
            return hit["powers"], hit["n"]

    start, end, _ = day_window(date, tz)
    records = await client.fetch_records(participant_id, start, end, tz)

    waveforms: list[np.ndarray] = []
    for rec in records:
        wf = np.asarray(rec.get("waveform", []), dtype=float)
        if wf.size:
            waveforms.append(wf)

    powers = aggregate_band_powers(waveforms, settings.sample_rate_hz)
    n = len(waveforms)
    if ttl > 0:
        cache_set(key, {"powers": powers, "n": n}, ttl)
    return powers, n


def _to_epoch(ts: str) -> float | None:
    """Parse an ISO 8601 timestamp to a UTC epoch, or None if unparseable."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def bucket_means(
    series: list[tuple[str, dict[str, float]]],
    bucket_seconds: int,
    round_to: int | None = None,
) -> list[tuple[str, dict[str, float], int]]:
    """Aggregate a per-second (iso_ts, metrics) series into fixed-width buckets.

    Each metric is computed per second *upstream*; this only averages the
    already-computed per-second values within each bucket. So per-second
    analysis is preserved, and `bucket_seconds=1` returns the raw points
    unchanged. Returns (bucket_start_iso, mean_metrics, n_records) ascending.
    """
    buckets: dict[int, list[dict[str, float]]] = {}
    for ts, metrics in series:
        epoch = _to_epoch(ts)
        if epoch is None:
            continue
        key = int(epoch // bucket_seconds) * bucket_seconds
        buckets.setdefault(key, []).append(metrics)

    out: list[tuple[str, dict[str, float], int]] = []
    for key in sorted(buckets):
        group = buckets[key]
        mean = {
            name: sum(m.get(name, 0.0) for m in group) / len(group) for name in group[0]
        }
        if round_to is not None:
            mean = {name: round(value, round_to) for name, value in mean.items()}
        ts = datetime.fromtimestamp(key, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        out.append((ts, mean, len(group)))
    return out


async def participant_power_timeline(
    client: AwearClient,
    participant_id: str,
    minutes: int,
    tz: str,
) -> list[tuple[str, dict[str, float]]]:
    """Per-second (1 Hz) band powers over the recent, delay-shifted window.

    Raw and unbucketed: one (timestamp, band_powers) entry per EEG record, in
    ascending time order. Callers run per-second formulas on this, then pass it
    through `bucket_means` to downsample for display. The window is shifted back
    by `data_delay_seconds` so it lands on data that has actually arrived.
    """
    settings = get_settings()
    delay = settings.data_delay_seconds
    fs = settings.sample_rate_hz
    ttl = settings.cache_ttl_seconds

    # Cache by the minutes/tz window so frequent polls (e.g. every 20s for the
    # TBR-over-time chart) don't re-pull a full window from AWEAR each tick.
    key = f"timeline:{participant_id}:{minutes}:{tz}"
    if ttl > 0:
        hit = cache_get(key)
        if hit is not None:
            return [(ts, powers) for ts, powers in hit["timeline"]]

    start, end = recent_window(minutes, tz, delay)
    records = await client.fetch_records(participant_id, start, end, tz)

    timeline: list[tuple[str, dict[str, float]]] = []
    for rec in records:
        wf = np.asarray(rec.get("waveform", []), dtype=float)
        if wf.size:
            timeline.append((str(rec.get("timestamp", "")), band_powers(wf, fs)))

    if ttl > 0:
        cache_set(key, {"timeline": timeline}, ttl)
    return timeline


async def participant_latest_waveform(
    client: AwearClient,
    participant_id: str,
    minutes: int,
    tz: str,
) -> tuple[str, np.ndarray, dict[str, np.ndarray], dict[str, float]] | None:
    """Return the most recent record's (timestamp, raw, band_signals, powers).

    Feeds the live feed: the raw waveform, its per-band filtered signals
    (split_bands), and the band powers for the current-state readout. Returns
    None when no waveform-bearing record exists in the recent window.
    """
    delay = get_settings().data_delay_seconds
    start, end = recent_window(minutes, tz, delay)
    records = await client.fetch_records(participant_id, start, end, tz)

    fs = get_settings().sample_rate_hz
    for rec in reversed(records):
        wf = np.asarray(rec.get("waveform", []), dtype=float)
        if wf.size:
            ts = str(rec.get("timestamp", ""))
            return ts, wf, split_bands(wf, fs), band_powers(wf, fs)
    return None
