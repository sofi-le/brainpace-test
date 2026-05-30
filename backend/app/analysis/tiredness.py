"""Tiredness / drowsiness estimation from EEG band powers.

Heuristic baseline: drowsiness is classically associated with a rise in
slow-wave activity relative to fast-wave activity. We use the
(theta + alpha) / beta ratio as a fatigue index. Higher => more tired.

NOTE: thresholds here are placeholders and must be calibrated against
labelled data before clinical/product use.
"""

from __future__ import annotations

from dataclasses import dataclass

EPS = 1e-9


@dataclass
class TirednessResult:
    score: float  # 0..1, higher = more tired
    index: float  # raw (theta+alpha)/beta ratio
    label: str  # "alert" | "drowsy" | "tired"


def estimate_tiredness(powers: dict[str, float]) -> TirednessResult:
    theta = powers.get("theta", 0.0)
    alpha = powers.get("alpha", 0.0)
    beta = powers.get("beta", 0.0)

    index = (theta + alpha) / (beta + EPS)

    # Squash the unbounded ratio into 0..1 (TODO: calibrate scale `k`).
    k = 2.0
    score = index / (index + k)

    if score < 0.4:
        label = "alert"
    elif score < 0.65:
        label = "drowsy"
    else:
        label = "tired"

    return TirednessResult(score=round(score, 4), index=round(index, 4), label=label)
