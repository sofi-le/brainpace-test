"""Tiredness detection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.analysis.tiredness import estimate_tiredness
from app.api.deps import get_awear_client
from app.clients.awear import AwearClient
from app.models.schemas import BandPowers, TirednessResponse
from app.services.eeg import participant_band_powers, participant_baseline_ratio

router = APIRouter(prefix="/tiredness", tags=["tiredness"])


@router.get("/{participant_id}", response_model=TirednessResponse)
async def participant_tiredness(
    participant_id: str,
    date: str | None = Query(None, description="YYYY-MM-DD (default: today)"),
    tz: str = Query("UTC", description="IANA timezone"),
    client: AwearClient = Depends(get_awear_client),
) -> TirednessResponse:
    powers, n = await participant_band_powers(client, participant_id, date, tz)
    baseline, _ = await participant_baseline_ratio(client, participant_id, date, tz)
    result = estimate_tiredness(powers, baseline)
    return TirednessResponse(
        participant_id=participant_id,
        records=n,
        band_powers=BandPowers(**powers),
        ftr=result.ftr,
        baseline=result.baseline,
        deviation_pct=result.deviation_pct,
        label=result.label,
    )
