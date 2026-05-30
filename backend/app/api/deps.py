"""FastAPI dependencies (shared resources injected into routes)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.clients.awear import AwearClient


async def get_awear_client() -> AsyncIterator[AwearClient]:
    """Yield an AWEAR client, closing it when the request finishes."""
    client = AwearClient()
    try:
        yield client
    finally:
        await client.aclose()
