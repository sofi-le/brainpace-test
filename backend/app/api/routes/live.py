"""Live EEG feed endpoints.

Serves the most recent EEG record for the live screen: the raw waveform, its
per-band filtered signals (split_bands / bandpass_fft output), and the current
band powers + cognitive ratios. AWEAR is batch-pulled, so "live" means the
latest available record within the recent window, not a true realtime stream.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, Query

from app.analysis.cognition import cognition_ratios
from app.api.deps import get_awear_client
from app.clients.awear import AwearClient
from app.core.config import get_settings
from app.models.schemas import BandPowers, WaveformResponse
from app.services.eeg import participant_latest_waveform

router = APIRouter(prefix="/live", tags=["live"])


def _round(values: np.ndarray) -> list[float]:
    return [round(v, 4) for v in values.tolist()]


@router.get("/{participant_id}/waveform", response_model=WaveformResponse)
async def participant_live_waveform(
    participant_id: str,
    minutes: int = Query(
        2, ge=1, le=60, description="Recent window to search (minutes)"
    ),
    tz: str = Query("UTC", description="IANA timezone"),
    client: AwearClient = Depends(get_awear_client),
) -> WaveformResponse:
    """Return the latest record's raw + filtered band waveforms and powers."""
    fs = get_settings().sample_rate_hz
    latest = await participant_latest_waveform(client, participant_id, minutes, tz)
    if latest is None:
        return WaveformResponse(
            participant_id=participant_id,
            timestamp=None,
            sample_rate_hz=fs,
            raw=[],
            bands={},
            band_powers=BandPowers(),
            ratios={},
        )

    timestamp, raw, bands, powers = latest
    return WaveformResponse(
        participant_id=participant_id,
        timestamp=timestamp,
        sample_rate_hz=fs,
        raw=_round(raw),
        bands={band: _round(sig) for band, sig in bands.items()},
        band_powers=BandPowers(**powers),
        ratios=cognition_ratios(powers),
    )
