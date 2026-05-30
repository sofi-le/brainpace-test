"""Tiredness / fatigue estimation from EEG band powers.

Fatigue is tracked by the **FTR** (fatigue ratio): (theta + alpha) / beta.
Slow-wave activity (theta, alpha) rises and fast-wave activity (beta) falls as
fatigue mounts, so a higher FTR => more tired.

Rather than reading the raw FTR against absolute thresholds, we measure it as a
**percent deviation from the subject's own calm baseline** — the mean FTR over a
fixed "period of calmness" (see `services.eeg.participant_baseline_ratio` and
`core.config.baseline_start_time`). That makes the brackets self-normalizing per
subject:

    deviation < +2%        -> "Normal"        (at/around baseline)
    +2% .. +6%             -> "Mild fatigue"
    +6% .. +14%            -> "Fatigued"
    >= +14%                -> "Burnout"

Deviations below the baseline (more rested than the calm reference) fall into
"Normal".

NOTE: the baseline window and bracket cut-offs are uncalibrated demo
placeholders and must be validated against labelled data before product use.
"""

from __future__ import annotations

from dataclasses import dataclass

EPS = 1e-9

# FTR percent-deviation-from-baseline bracket upper bounds (exclusive).
MILD_FATIGUE_PCT = 2.0
FATIGUED_PCT = 6.0
BURNOUT_PCT = 14.0


@dataclass
class TirednessResult:
    ftr: float  # current (theta+alpha)/beta fatigue ratio
    baseline: float  # mean FTR over the calm baseline window (0% reference)
    deviation_pct: float  # FTR deviation from baseline, percent
    label: str  # "Normal" | "Mild fatigue" | "Fatigued" | "Burnout" | "unknown"


def fatigue_ratio(powers: dict[str, float]) -> float:
    """The FTR: (theta + alpha) / beta for one set of band powers."""
    theta = powers.get("theta", 0.0)
    alpha = powers.get("alpha", 0.0)
    beta = powers.get("beta", 0.0)
    return (theta + alpha) / (beta + EPS)


def classify_fatigue(deviation_pct: float) -> str:
    """Map an FTR percent-deviation-from-baseline to a fatigue bracket."""
    if deviation_pct < MILD_FATIGUE_PCT:
        return "Normal"
    if deviation_pct < FATIGUED_PCT:
        return "Mild fatigue"
    if deviation_pct < BURNOUT_PCT:
        return "Fatigued"
    return "Burnout"


def estimate_tiredness(
    powers: dict[str, float], baseline_ratio: float | None
) -> TirednessResult:
    """Classify fatigue from current band powers vs. the calm-baseline FTR.

    `baseline_ratio` is the mean FTR over the baseline window. When it is
    missing or non-positive (no baseline data available) the deviation can't be
    computed and the label is "unknown".
    """
    ftr = fatigue_ratio(powers)
    if baseline_ratio is None or baseline_ratio <= EPS:
        return TirednessResult(
            ftr=round(ftr, 4),
            baseline=round(baseline_ratio or 0.0, 4),
            deviation_pct=0.0,
            label="unknown",
        )

    deviation_pct = (ftr - baseline_ratio) / baseline_ratio * 100.0
    return TirednessResult(
        ftr=round(ftr, 4),
        baseline=round(baseline_ratio, 4),
        deviation_pct=round(deviation_pct, 2),
        label=classify_fatigue(deviation_pct),
    )
