"""Async client for the AWEAR B2B API.

Wraps the `/members` and `/members/{id}/data` endpoints used to pull raw
RIGHT_TEMP (TP10) EEG records (256 samples @ 256 Hz per record).
See docs/awear-api.md for the API contract.
"""

from __future__ import annotations

import asyncio

import httpx

from app.core.config import Settings, get_settings

PAGE_LIMIT = 50000  # API max per request


class AwearError(RuntimeError):
    """Raised when the AWEAR API returns a non-recoverable error."""


class AwearClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        if not self._settings.awear_api_key:
            raise AwearError("AWEAR_API_KEY not set (check backend/.env)")
        self._client = httpx.AsyncClient(
            base_url=self._settings.awear_base_url,
            headers={"Authorization": f"Bearer {self._settings.awear_api_key}"},
            timeout=60.0,
        )

    async def __aenter__(self) -> "AwearClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict | None = None) -> dict:
        """GET a path with basic 429 (rate-limit) backoff."""
        for _ in range(6):
            resp = await self._client.get(path, params=params)
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", "5"))
                await asyncio.sleep(wait)
                continue
            if not resp.is_success:
                try:
                    err = resp.json().get("error", {})
                    detail = f"{err.get('code')}: {err.get('message')}"
                except Exception:
                    detail = resp.text[:200]
                raise AwearError(f"{resp.status_code} {path} -> {detail}")
            return resp.json()
        raise AwearError(f"giving up after repeated rate limits on {path}")

    async def list_bound_participants(self) -> list[str]:
        """Return participant ids for members with a bound device."""
        data = await self._get("/members")
        members = data.get("members", [])
        return [m["participantId"] for m in members if m.get("accessState") == "bound"]

    async def fetch_records(
        self, participant_id: str, start: str, end: str, tz: str
    ) -> list[dict]:
        """Fetch all EEG records for a participant in [start, end], paginating."""
        records: list[dict] = []
        offset = 0
        while True:
            page = await self._get(
                f"/members/{participant_id}/data",
                params={
                    "start": start,
                    "end": end,
                    "tz": tz,
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
        return records
