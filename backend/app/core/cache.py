"""Tiny SQLite-backed TTL cache.

A throwaway local-file cache so demo polling (especially the shared day-aggregate
behind /summary, /mood, /tiredness) doesn't re-hit the AWEAR API on every
request. Stores JSON values keyed by an arbitrary string, each with an expiry.

This is a demo stopgap, not a real datastore: no eviction, single table, blocking
sqlite calls (fine for local sub-ms reads). Delete artifacts/cache.db to reset.
"""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Any

from app.core.config import get_settings

_DB_PATH = Path(get_settings().artifacts_dir) / "cache.db"


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")  # tolerate concurrent reads/writes
    conn.execute("PRAGMA busy_timeout=3000")  # wait, don't error, on lock
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cache "
        "(key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at REAL NOT NULL)"
    )
    return conn


def cache_get(key: str) -> Any | None:
    """Return the cached value for `key`, or None if missing or expired."""
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
        ).fetchone()
    if row is None or row[1] < time.time():
        return None
    return json.loads(row[0])


def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    """Store a JSON-serializable `value` under `key` for `ttl_seconds`."""
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            (key, json.dumps(value), time.time() + ttl_seconds),
        )
        conn.commit()
