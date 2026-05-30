"""Frequency-band signal processing for single-channel EEG.

The AWEAR API exposes one channel (RIGHT_TEMP / TP10). These helpers turn a
raw waveform into the classic EEG bands and into per-band power features that
the analysis layer consumes.
"""

from __future__ import annotations

import numpy as np

# Classic EEG frequency bands (Hz).
BANDS: dict[str, tuple[float, float]] = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 45.0),
}


def bandpass_fft(
    waveform: np.ndarray, low_hz: float, high_hz: float, fs: int
) -> np.ndarray:
    """Band-pass filter a 1-D signal by zeroing out-of-band FFT bins.

    Simple, dependency-light approach suited to short fixed-length records.
    Returns the band-limited signal in the time domain.
    """
    n = waveform.shape[0]
    spectrum = np.fft.rfft(waveform)
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    mask = (freqs >= low_hz) & (freqs < high_hz)
    spectrum[~mask] = 0.0
    return np.fft.irfft(spectrum, n=n)


def split_bands(waveform: np.ndarray, fs: int) -> dict[str, np.ndarray]:
    """Separate a waveform into its band-limited components (time domain).

    Returns one band-pass-filtered waveform per entry in BANDS — the raw
    signal's "wavelengths" isolated for inspection, plotting, or per-band
    feature extraction. The bands sum back (approximately) to the input.
    """
    wf = np.asarray(waveform, dtype=float)
    return {
        band: bandpass_fft(wf, low, high, fs) for band, (low, high) in BANDS.items()
    }


def band_powers(waveform: np.ndarray, fs: int) -> dict[str, float]:
    """Return mean power per band for a single waveform.

    Power is computed from the periodogram (|FFT|^2) summed over each band's
    bins, normalized by the number of samples.
    """
    wf = np.asarray(waveform, dtype=float)
    n = wf.shape[0]
    if n == 0:
        return {band: 0.0 for band in BANDS}
    spectrum = np.fft.rfft(wf)
    power = (np.abs(spectrum) ** 2) / n
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    out: dict[str, float] = {}
    for band, (low, high) in BANDS.items():
        mask = (freqs >= low) & (freqs < high)
        out[band] = float(power[mask].sum())
    return out


def aggregate_band_powers(waveforms: list[np.ndarray], fs: int) -> dict[str, float]:
    """Average band powers across many records (e.g. a day's worth)."""
    if not waveforms:
        return {band: 0.0 for band in BANDS}
    totals = {band: 0.0 for band in BANDS}
    for wf in waveforms:
        for band, val in band_powers(wf, fs).items():
            totals[band] += val
    n = len(waveforms)
    return {band: val / n for band, val in totals.items()}
