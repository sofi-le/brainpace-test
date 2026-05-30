"""Cognitive-function endpoints.

Returns a cognitive-ratio plot series (e.g. theta/beta TBR) for a participant's
recent EEG. One AWEAR call pulls the whole window; ratios are computed *per
second* (1 Hz), then optionally downsampled for display:

    bucket=1s  -> raw per-second points (run your own per-second formulas)
    bucket=20s -> per-second ratios averaged into 20-second plot points

The window is shifted back by the configured ingestion delay so a "last N
minutes" request lands on data that has actually arrived. Each point also
carries the mean band powers, so per-second band-level formulas can run too.

Downstream analysis (alarms / notifications) is layered on top later and is
intentionally not implemented here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.analysis.cognition import RATIOS, cognition_ratios
from app.api.deps import get_awear_client
from app.clients.awear import AwearClient
from app.core.config import get_settings
from app.core.timewindow import parse_duration
from app.models.schemas import BandPowers, CognitionPoint, CognitionResponse
from app.services.eeg import bucket_means, participant_power_timeline

router = APIRouter(prefix="/cognition", tags=["cognition"])


@router.get("/{participant_id}/series", response_model=CognitionResponse)
async def participant_cognition_series(
    participant_id: str,
    minutes: int = Query(5, ge=1, le=1440, description="Recent window size (minutes)"),
    bucket: str = Query("1s", description="Display resolution: 1s (raw), 20s, 1m, ..."),
    tz: str = Query("UTC", description="IANA timezone"),
    client: AwearClient = Depends(get_awear_client),
) -> CognitionResponse:
    """Return per-second-analyzed cognitive ratios, bucketed for display."""
    try:
        bucket_seconds = parse_duration(bucket)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    timeline = await participant_power_timeline(client, participant_id, minutes, tz)

    # Compute ratios per second first, then average per bucket (never the
    # reverse) so bucket=1s is exactly the raw per-second analysis.
    ratio_buckets = bucket_means(
        [(ts, cognition_ratios(powers)) for ts, powers in timeline],
        bucket_seconds,
        round_to=4,
    )
    power_buckets = bucket_means(timeline, bucket_seconds)

    points = [
        CognitionPoint(
            timestamp=ts,
            samples=n,
            ratios=ratios,
            band_powers=BandPowers(**powers),
        )
        for (ts, ratios, n), (_, powers, _) in zip(ratio_buckets, power_buckets)
    ]
    return CognitionResponse(
        participant_id=participant_id,
        records=len(timeline),
        bucket_seconds=bucket_seconds,
        delay_seconds=get_settings().data_delay_seconds,
        ratios=list(RATIOS),
        points=points,
    )
