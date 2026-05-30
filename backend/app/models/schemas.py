"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BandPowers(BaseModel):
    delta: float = 0.0
    theta: float = 0.0
    alpha: float = 0.0
    beta: float = 0.0
    gamma: float = 0.0


class TirednessResponse(BaseModel):
    participant_id: str
    records: int = Field(..., description="Number of EEG records analyzed")
    band_powers: BandPowers
    score: float = Field(..., description="0..1, higher = more tired")
    index: float = Field(..., description="Raw (theta+alpha)/beta ratio")
    label: str


class MoodResponse(BaseModel):
    participant_id: str
    records: int = Field(..., description="Number of EEG records analyzed")
    band_powers: BandPowers
    valence: float = Field(..., description="0..1, higher = more pleasant")
    arousal: float = Field(..., description="0..1, higher = more aroused")
    label: str


class CognitionPoint(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp (bucket start)")
    samples: int = Field(
        ..., description="Per-second records aggregated into this point"
    )
    ratios: dict[str, float] = Field(
        ...,
        description="Cognitive ratio name -> value (mean of per-second values in bucket)",
    )
    band_powers: BandPowers = Field(
        ..., description="Mean per-second band powers in bucket"
    )


class CognitionResponse(BaseModel):
    participant_id: str
    records: int = Field(..., description="Raw per-second records analyzed")
    bucket_seconds: int = Field(
        ..., description="Display bucket width in seconds (1 = raw per-second)"
    )
    delay_seconds: int = Field(
        ..., description="Ingestion lag the window was shifted back by"
    )
    ratios: list[str] = Field(
        ..., description="Names of the cognitive ratios present in each point"
    )
    points: list[CognitionPoint] = Field(
        ..., description="Plot points, ascending by timestamp"
    )


class WaveformResponse(BaseModel):
    """Latest EEG record: raw signal + per-band filtered signals for the live feed."""

    participant_id: str
    timestamp: str | None = Field(
        None, description="ISO 8601 of the record (null if none)"
    )
    sample_rate_hz: int
    raw: list[float] = Field(..., description="Raw waveform samples")
    bands: dict[str, list[float]] = Field(
        ..., description="Band name -> bandpass_fft filtered waveform"
    )
    band_powers: BandPowers
    ratios: dict[str, float] = Field(..., description="Cognitive ratio name -> value")


class MoodSummary(BaseModel):
    valence: float
    arousal: float
    label: str


class TirednessSummary(BaseModel):
    score: float
    index: float
    label: str


class SummaryResponse(BaseModel):
    """Current value of every metric for the home screen (single round-trip)."""

    participant_id: str
    records: int = Field(..., description="Number of EEG records analyzed")
    band_powers: BandPowers
    mood: MoodSummary
    tiredness: TirednessSummary
    cognition: dict[str, float] = Field(
        ..., description="Cognitive ratio name -> current value"
    )


class HealthResponse(BaseModel):
    status: str = "ok"
    app: str
