"""Home-screen summary endpoint.

Fans out over every analysis (mood, tiredness, cognition) from a single AWEAR
pull and returns each metric's current value, so the app's home screen gets a
first paint in one round-trip instead of one request per component.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.analysis.cognition import cognition_ratios
from app.analysis.mood import estimate_mood
from app.analysis.tiredness import estimate_tiredness
from app.api.deps import get_awear_client
from app.clients.awear import AwearClient
from app.models.schemas import (
    BandPowers,
    MoodSummary,
    SummaryResponse,
    TirednessSummary,
)
from app.services.eeg import participant_band_powers, participant_baseline_ratio

router = APIRouter(prefix="/summary", tags=["summary"])


@router.get("/{participant_id}", response_model=SummaryResponse)
async def participant_summary(
    participant_id: str,
    date: str | None = Query(None, description="YYYY-MM-DD (default: today)"),
    tz: str = Query("UTC", description="IANA timezone"),
    client: AwearClient = Depends(get_awear_client),
) -> SummaryResponse:
    """Return the current value of every metric for the given day."""
    powers, n = await participant_band_powers(client, participant_id, date, tz)
    baseline, _ = await participant_baseline_ratio(client, participant_id, date, tz)
    mood = estimate_mood(powers)
    tired = estimate_tiredness(powers, baseline)
    return SummaryResponse(
        participant_id=participant_id,
        records=n,
        band_powers=BandPowers(**powers),
        mood=MoodSummary(valence=mood.valence, arousal=mood.arousal, label=mood.label),
        tiredness=TirednessSummary(
            ftr=tired.ftr,
            baseline=tired.baseline,
            deviation_pct=tired.deviation_pct,
            label=tired.label,
        ),
        cognition=cognition_ratios(powers),
    )
