"""Member / participant listing endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_awear_client
from app.clients.awear import AwearClient

router = APIRouter(prefix="/members", tags=["members"])


@router.get("")
async def list_members(
    client: AwearClient = Depends(get_awear_client),
) -> dict[str, list[str]]:
    """Return participant ids that currently have a bound device."""
    return {"participants": await client.list_bound_participants()}
