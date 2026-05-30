#!/usr/bin/env python3
"""Pull today's EEG data from the AWEAR API and split it into the classic
EEG frequency bands (theta, alpha, beta), writing one CSV per band.

The AWEAR `/data` endpoint returns the raw RIGHT_TEMP (TP10) channel as
256 samples @ 256 Hz per record (1 second of signal). This script fetches
every record recorded today for every member in the group, band-pass filters
each record into theta/alpha/beta via FFT, and writes the band-limited
waveforms to separate CSV files.

Output CSV columns mirror the API's own csv format:
    timestamp, participant_id, device_id, s0, s1, ..., s255

Usage:
    uv run scripts/pull_today_bands.py
    uv run scripts/pull_today_bands.py --tz Europe/Rome --out ./eeg_out
    uv run scripts/pull_today_bands.py --date 2026-05-30 --participants P-A1B2C3,P-D4E5F6

See docs/awear-api.md for the API contract.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import requests
from dotenv import load_dotenv

BASE = "https://awear-b2b-2026.vercel.app/api/v1"
# Default export root: backend/artifacts/ (script lives in backend/scripts/).
ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"
SAMPLE_RATE_HZ = 256  # RIGHT_TEMP (TP10), 256 samples @ 256 Hz per record
PAGE_LIMIT = 50000  # API max per request

# Classic EEG frequency bands (Hz). The API exposes a single channel, so we
# split the raw signal into these bands via band-pass filtering.
BANDS = {
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
}


def bandpass_fft(
    waveform: np.ndarray, low_hz: float, high_hz: float, fs: int
) -> np.ndarray:
    """Band-pass filter a 1-D signal by zeroing out-of-band FFT bins.

    Simple, dependency-light approach suited to short fixed-length records.
    Returns the band-limited signal in the time domain.
    """
    n = waveform.shape[0]
    spectrum = np.fft.rfft(waveform)
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    mask = (freqs >= low_hz) & (freqs < high_hz)
    spectrum[~mask] = 0.0
    return np.fft.irfft(spectrum, n=n)


def day_window(date_str: str | None, tz: ZoneInfo) -> tuple[str, str, str]:
    """Return (start_iso, end_iso, date_label) for the given day in `tz`.

    Defaults to today. end is capped at 'now' if the day is today, otherwise
    the full 24h window is used.
    """
    now = datetime.now(tz)
    if date_str:
        day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
    else:
        day = now
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    next_day = start + timedelta(days=1)
    end = min(now, next_day) if start.date() == now.date() else next_day
    # Convert to UTC ISO 8601 (the API accepts ISO timestamps; we still pass tz
    # separately so returned timestamps are localized).
    start_utc = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_utc = end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return start_utc, end_utc, start.strftime("%Y-%m-%d")


def api_get(session: requests.Session, path: str, params: dict | None = None) -> dict:
    """GET an API endpoint with basic 429 (rate-limit) backoff."""
    url = f"{BASE}{path}"
    for attempt in range(6):
        resp = session.get(url, params=params, timeout=60)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "5"))
            print(f"  rate limited, waiting {wait}s...", file=sys.stderr)
            time.sleep(wait)
            continue
        if not resp.ok:
            try:
                err = resp.json().get("error", {})
                detail = f"{err.get('code')}: {err.get('message')}"
            except Exception:
                detail = resp.text[:200]
            raise RuntimeError(f"{resp.status_code} {path} -> {detail}")
        return resp.json()
    raise RuntimeError(f"giving up after repeated rate limits on {path}")


def list_participants(session: requests.Session) -> list[str]:
    data = api_get(session, "/members")
    members = data.get("members", [])
    # Only members with a bound device will return data.
    return [m["participantId"] for m in members if m.get("accessState") == "bound"]


def fetch_records(
    session: requests.Session, participant_id: str, start: str, end: str, tz_name: str
) -> list[dict]:
    """Fetch all EEG records for a participant in the window, paginating."""
    records: list[dict] = []
    offset = 0
    while True:
        page = api_get(
            session,
            f"/members/{participant_id}/data",
            params={
                "start": start,
                "end": end,
                "tz": tz_name,
                "limit": PAGE_LIMIT,
                "offset": offset,
                "sort": "asc",
                "format": "json",
            },
        )
        batch = page.get("data", [])
        records.extend(batch)
        pagination = page.get("pagination", {})
        if not pagination.get("hasMore") or not batch:
            break
        offset += len(batch)
        print(f"    fetched {len(records)} records...", file=sys.stderr)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tz", default="UTC", help="IANA timezone (default: UTC)")
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: today)")
    parser.add_argument(
        "--participants",
        default=None,
        help="Comma-separated participant ids (default: all bound members)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output directory (default: backend/artifacts/eeg_bands_<date>)",
    )
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ.get("AWEAR_API_KEY")
    if not api_key:
        print("ERROR: AWEAR_API_KEY not set (check backend/.env)", file=sys.stderr)
        return 1

    try:
        tz = ZoneInfo(args.tz)
    except Exception:
        print(f"ERROR: unknown timezone {args.tz!r}", file=sys.stderr)
        return 1

    start, end, date_label = day_window(args.date, tz)
    out_dir = Path(args.out) if args.out else ARTIFACTS_DIR / f"eeg_bands_{date_label}"
    out_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {api_key}"})

    print(f"Window: {start} -> {end} (tz={args.tz})", file=sys.stderr)

    if args.participants:
        participants = [p.strip() for p in args.participants.split(",") if p.strip()]
    else:
        participants = list_participants(session)
    if not participants:
        print("No bound participants found — nothing to pull.", file=sys.stderr)
        return 0
    print(f"Participants: {', '.join(participants)}", file=sys.stderr)

    # Open one CSV writer per band.
    sample_cols = [f"s{i}" for i in range(SAMPLE_RATE_HZ)]
    header = ["timestamp", "participant_id", "device_id", *sample_cols]
    files = {}
    writers = {}
    counts = {band: 0 for band in BANDS}
    for band in BANDS:
        fh = (out_dir / f"{band}.csv").open("w", newline="")
        files[band] = fh
        w = csv.writer(fh)
        w.writerow(header)
        writers[band] = w

    try:
        for pid in participants:
            print(f"\n{pid}: fetching...", file=sys.stderr)
            try:
                records = fetch_records(session, pid, start, end, args.tz)
            except RuntimeError as e:
                print(f"  skipping {pid}: {e}", file=sys.stderr)
                continue
            print(f"  {len(records)} records", file=sys.stderr)

            for rec in records:
                wf = np.asarray(rec.get("waveform", []), dtype=float)
                if wf.size == 0:
                    continue
                ts = rec.get("timestamp", "")
                dev = rec.get("device_id", "")
                for band, (low, high) in BANDS.items():
                    filtered = bandpass_fft(wf, low, high, SAMPLE_RATE_HZ)
                    row = [ts, pid, dev, *(f"{v:.6f}" for v in filtered)]
                    writers[band].writerow(row)
                    counts[band] += 1
    finally:
        for fh in files.values():
            fh.close()

    print("\nDone. Rows written per band:", file=sys.stderr)
    for band in BANDS:
        print(
            f"  {band:6s} -> {out_dir / f'{band}.csv'} ({counts[band]} rows)",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
