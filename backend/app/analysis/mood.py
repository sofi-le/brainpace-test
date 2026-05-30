"""Mood estimation from EEG band powers.

Heuristic baseline: frontal/temporal alpha activity is loosely linked to
relaxation and affective state. We derive two crude axes from band ratios:

    valence (unpleasant..pleasant): proxied by alpha / (alpha + beta)
    arousal (calm..excited):        proxied by beta / (alpha + theta + beta)

NOTE: single-channel (TP10) EEG cannot capture true frontal-alpha asymmetry;
these are placeholder signals to be calibrated/replaced with a real model.
"""

from __future__ import annotations

from dataclasses import dataclass

EPS = 1e-9


@dataclass
class MoodResult:
    valence: float  # 0..1, higher = more pleasant
    arousal: float  # 0..1, higher = more aroused/excited
    label: str


def _quadrant(valence: float, arousal: float) -> str:
    """Map the valence/arousal plane to a coarse mood label."""
    if arousal >= 0.5:
        return "happy" if valence >= 0.5 else "stressed"
    return "calm" if valence >= 0.5 else "down"


def estimate_mood(powers: dict[str, float]) -> MoodResult:
    theta = powers.get("theta", 0.0)
    alpha = powers.get("alpha", 0.0)
    beta = powers.get("beta", 0.0)

    valence = alpha / (alpha + beta + EPS)
    arousal = beta / (alpha + theta + beta + EPS)

    return MoodResult(
        valence=round(valence, 4),
        arousal=round(arousal, 4),
        label=_quadrant(valence, arousal),
    )
