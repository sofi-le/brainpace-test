"""Cognitive-function estimation from EEG band powers.

Cognitive function is summarized by a set of band-power *ratios*. Each ratio
isolates a different facet of cognition; we expose them as named indices so the
API can emit one plottable point per metric per EEG record.

Ratios:
    tbr: theta / beta  (Theta-Beta Ratio)
        The headline cognitive-strain / fatigue metric. Rising theta over
        falling beta tracks mounting cognitive load; ~1-2 alert, 2-3 mild,
        >3 significant, >4-5 severe/drowsy (thresholds applied client-side).
    cognitive_state: alpha / theta
        Alpha relative to theta tracks relaxed, alert cognitive readiness.
        A falling ratio trends toward drowsiness / disengagement, a rising one
        toward calm, focused wakefulness.

The ratio set is intentionally a registry: add a new entry to RATIOS (e.g.
theta/beta for attention, beta/alpha for engagement) and it flows through the
service and API without any further changes.

NOTE: single-channel (TP10) EEG and these uncalibrated ratios are a heuristic
baseline. Thresholds / alarms on top of these points are layered on later.
"""

from __future__ import annotations

from collections.abc import Callable

EPS = 1e-9

# A cognitive ratio maps one set of band powers to a single scalar index.
Ratio = Callable[[dict[str, float]], float]


def _theta_beta(powers: dict[str, float]) -> float:
    """Cognitive strain / fatigue: theta / beta (TBR)."""
    return powers.get("theta", 0.0) / (powers.get("beta", 0.0) + EPS)


def _alpha_theta(powers: dict[str, float]) -> float:
    """Cognitive state: alpha / theta."""
    return powers.get("alpha", 0.0) / (powers.get("theta", 0.0) + EPS)


# Registry of named cognitive ratios. The API returns every entry here; new
# metrics only need to be added to this dict.
RATIOS: dict[str, Ratio] = {
    "tbr": _theta_beta,
    "cognitive_state": _alpha_theta,
}


def cognition_ratios(powers: dict[str, float]) -> dict[str, float]:
    """Compute every registered cognitive ratio from one set of band powers."""
    return {name: round(fn(powers), 4) for name, fn in RATIOS.items()}
