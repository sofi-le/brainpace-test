"""Mood tracking endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.analysis.mood import estimate_mood
from app.api.deps import get_awear_client
from app.clients.awear import AwearClient
from app.models.schemas import BandPowers, MoodResponse
from app.services.eeg import participant_band_powers

router = APIRouter(prefix="/mood", tags=["mood"])


@router.get("/{participant_id}", response_model=MoodResponse)
async def participant_mood(
    participant_id: str,
    date: str | None = Query(None, description="YYYY-MM-DD (default: today)"),
    tz: str = Query("UTC", description="IANA timezone"),
    client: AwearClient = Depends(get_awear_client),
) -> MoodResponse:
    powers, n = await participant_band_powers(client, participant_id, date, tz)
    result = estimate_mood(powers)
    return MoodResponse(
        participant_id=participant_id,
        records=n,
        band_powers=BandPowers(**powers),
        valence=result.valence,
        arousal=result.arousal,
        label=result.label,
    )
