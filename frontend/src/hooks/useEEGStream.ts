/**
 * useEEGStream — single hook powering every screen.
 *
 * Pulls live data from the Brainspace FastAPI backend (see src/api.ts):
 *   - /cognition/{id}/series?bucket=20s  → TBR-over-time points (one per 20s)
 *   - /summary/{id}                      → current band powers + tiredness
 *
 * The backend reads EEG from the AWEAR API (which ingests with a ~5-min lag),
 * so the hook polls on an interval rather than streaming. Set USE_MOCK = true
 * to run the UI with synthetic data when no backend is reachable.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  BandPowers,
  EpochData,
  Prediction,
  TBRPoint,
  FatigueState,
} from '../types';
import { getTBRLevel } from '../theme';
import {
  fetchCognitionSeries,
  fetchSummary,
  resolveParticipantId,
  type CognitionPoint,
} from '../api';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
const USE_MOCK = false;                 // ← true to run without a backend
const POLL_INTERVAL_MS = 20 * 1000;     // refresh every 20s (matches 20s buckets)
const COUNTDOWN_TICK_MS = 1000;
const BASELINE_TBR_FALLBACK = 1.4;

// ═══════════════════════════════════════════════════════════════════════════════
// Hook output — same shape whether mock or real
// ═══════════════════════════════════════════════════════════════════════════════
export interface EEGStream {
  tbr: number;
  fatigueState: FatigueState;
  fatigueColor: string;
  bands: BandPowers;
  prediction: Prediction | null;
  tbrHistory: TBRPoint[];

  sessionSec: number;
  breakCount: number;
  isConnected: boolean;
  participantId: string | null;
  error: string | null;

  lastPullAgo: number;
  nextPullIn: number;
  epochsInWindow: number;

  // Extra metric surfaced by /summary (0..1, higher = more tired)
  tirednessScore: number;
  tirednessLabel: string;

  logBreak: () => void;
  refreshNow: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers: turn the backend series into the shapes the screens expect
// ═══════════════════════════════════════════════════════════════════════════════
function tbrOf(point: CognitionPoint): number {
  return point.ratios?.tbr ?? 0;
}

function pointToEpoch(point: CognitionPoint): EpochData {
  const level = getTBRLevel(tbrOf(point));
  const bp = point.band_powers;
  return {
    timestamp: Date.parse(point.timestamp) / 1000,
    delta: bp.delta,
    theta: bp.theta,
    alpha: bp.alpha,
    beta: bp.beta,
    gamma: bp.gamma,
    tbr: Math.round(tbrOf(point) * 1000) / 1000,
    fatigue_state: level.state as FatigueState,
    fatigue_color: level.color,
  };
}

function seriesToHistory(points: CognitionPoint[]): TBRPoint[] {
  if (points.length === 0) return [];
  const t0 = Date.parse(points[0].timestamp) / 1000;
  return points.map(p => {
    const tbr = Math.round(tbrOf(p) * 1000) / 1000;
    return {
      time: Date.parse(p.timestamp) / 1000 - t0,
      tbr,
      state: getTBRLevel(tbr).state as FatigueState,
      ts: p.timestamp,
    };
  });
}

/** Least-squares slope of TBR vs time (per minute) over the last N points. */
function computePrediction(
  history: TBRPoint[],
  currentTBR: number,
): Prediction {
  const tail = history.slice(-10);
  let slopePerMin = 0;
  if (tail.length >= 2) {
    const xs = tail.map(p => p.time / 60); // minutes
    const ys = tail.map(p => p.tbr);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    slopePerMin = den > 0 ? num / den : 0;
  }

  const baseline =
    history.length >= 3
      ? history.slice(0, 3).reduce((a, p) => a + p.tbr, 0) / 3
      : BASELINE_TBR_FALLBACK;

  const SEVERE = 4.0;
  const minsToSevere =
    slopePerMin > 0.001 && currentTBR < SEVERE
      ? (SEVERE - currentTBR) / slopePerMin
      : null;

  const retention = Math.max(
    20,
    Math.round(100 - Math.max(0, currentTBR - baseline) * 16),
  );

  return {
    current_tbr: Math.round(currentTBR * 100) / 100,
    baseline_tbr: Math.round(baseline * 100) / 100,
    tbr_vs_baseline: Math.round((currentTBR - baseline) * 100) / 100,
    slope_per_min: Math.round(slopePerMin * 10000) / 10000,
    trend:
      slopePerMin > 0.05
        ? 'increasing'
        : slopePerMin < -0.05
          ? 'decreasing'
          : 'stable',
    predicted_severe_in_min: minsToSevere != null ? Math.round(minsToSevere) : null,
    optimal_break_in_min:
      minsToSevere != null ? Math.max(0, Math.round(minsToSevere) - 5) : null,
    recommendation:
      currentTBR > 3.5
        ? '⚠ Take a break now.'
        : currentTBR > 2.5
          ? 'Fatigue building. Break soon.'
          : "You're doing well.",
    urgency:
      currentTBR > 3.5
        ? 'critical'
        : currentTBR > 2.5
          ? 'warning'
          : currentTBR > 2.0
            ? 'info'
            : 'none',
    estimated_retention: retention,
    retention_note: `~${retention}% retention at current fatigue`,
  };
}

// ── Mock fallback (USE_MOCK = true) ──────────────────────────────────────────
function mockPull(pullIndex: number): { epoch: EpochData; prediction: Prediction } {
  const baseTBR = 1.4 + pullIndex * 0.15 + (Math.random() - 0.5) * 0.3;
  const tbr = Math.max(0.8, Math.min(5.0, baseTBR));
  const beta = (3.5 + Math.random() * 2) * 1e-6;
  const theta = tbr * beta;
  const level = getTBRLevel(tbr);
  const epoch: EpochData = {
    timestamp: Date.now() / 1000,
    delta: (1.5 + Math.random()) * 1e-6,
    theta,
    alpha: (6 + Math.random() * 4) * 1e-6,
    beta,
    gamma: (0.8 + Math.random() * 0.8) * 1e-6,
    tbr: Math.round(tbr * 1000) / 1000,
    fatigue_state: level.state as FatigueState,
    fatigue_color: level.color,
  };
  const pred = computePrediction(
    [{ time: pullIndex * 20, tbr, state: level.state as FatigueState }],
    tbr,
  );
  return { epoch, prediction: pred };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════
export function useEEGStream(): EEGStream {
  const [tbr, setTbr] = useState(0);
  const [fatigueState, setFatigueState] = useState<FatigueState>('alert');
  const [fatigueColor, setFatigueColor] = useState('#33DB85');
  const [bands, setBands] = useState<BandPowers>({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 });
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [tbrHistory, setTbrHistory] = useState<TBRPoint[]>([]);
  const [sessionSec, setSessionSec] = useState(0);
  const [breakCount, setBreakCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPullAgo, setLastPullAgo] = useState(0);
  const [nextPullIn, setNextPullIn] = useState(POLL_INTERVAL_MS / 1000);
  const [epochsInWindow, setEpochsInWindow] = useState(0);
  const [tirednessScore, setTirednessScore] = useState(0);
  const [tirednessLabel, setTirednessLabel] = useState('alert');

  const sessionStart = useRef(Date.now());
  const lastPullTime = useRef(Date.now());
  const pidRef = useRef<string | null>(null);
  const mockIndex = useRef(0);

  // ── Apply a freshly computed epoch + history ────────────────────────────────
  const applyEpoch = useCallback(
    (epoch: EpochData, history: TBRPoint[], pred: Prediction, epochs: number) => {
      setTbr(epoch.tbr);
      setFatigueState(epoch.fatigue_state);
      setFatigueColor(epoch.fatigue_color);
      setBands({ delta: epoch.delta, theta: epoch.theta, alpha: epoch.alpha, beta: epoch.beta, gamma: epoch.gamma });
      setTbrHistory(history);
      setPrediction(pred);
      setEpochsInWindow(epochs);
      lastPullTime.current = Date.now();
      setLastPullAgo(0);
      setNextPullIn(POLL_INTERVAL_MS / 1000);
    },
    [],
  );

  // ── One pull ─────────────────────────────────────────────────────────────────
  const doPull = useCallback(async () => {
    if (USE_MOCK) {
      const { epoch } = mockPull(mockIndex.current);
      const elapsed = (Date.now() - sessionStart.current) / 1000;
      setTbrHistory(prev => {
        const next = [...prev, { time: elapsed, tbr: epoch.tbr, state: epoch.fatigue_state }];
        applyEpoch(epoch, next, computePrediction(next, epoch.tbr), 300);
        return next;
      });
      mockIndex.current += 1;
      setIsConnected(true);
      setError(null);
      return;
    }

    try {
      let pid = pidRef.current;
      if (!pid) {
        pid = await resolveParticipantId();
        pidRef.current = pid;
        setParticipantId(pid);
      }
      if (!pid) {
        setIsConnected(false);
        setError('No bound participant found on /members');
        return;
      }

      const [series, summary] = await Promise.all([
        fetchCognitionSeries(pid),
        fetchSummary(pid).catch(() => null),
      ]);

      const points = series.points ?? [];
      if (points.length === 0) {
        setIsConnected(true);
        setError('No EEG data in the recent window yet');
        return;
      }

      const history = seriesToHistory(points);
      const latest = pointToEpoch(points[points.length - 1]);
      const pred = computePrediction(history, latest.tbr);
      applyEpoch(latest, history, pred, series.records);

      if (summary) {
        setTirednessScore(summary.tiredness.deviation_pct);
        setTirednessLabel(summary.tiredness.label);
      }
      setIsConnected(true);
      setError(null);
    } catch (e) {
      setIsConnected(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applyEpoch]);

  // ── Initial pull + polling ─────────────────────────────────────────────────
  useEffect(() => {
    doPull();
    const timer = setInterval(doPull, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [doPull]);

  // ── 1s countdown / session clock ────────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      const sincePull = Math.floor((Date.now() - lastPullTime.current) / 1000);
      const poll = POLL_INTERVAL_MS / 1000;
      setLastPullAgo(sincePull);
      setNextPullIn(Math.max(0, poll - sincePull));
      setSessionSec(Math.floor((Date.now() - sessionStart.current) / 1000));
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const logBreak = useCallback(() => setBreakCount(c => c + 1), []);
  const refreshNow = useCallback(() => { doPull(); }, [doPull]);

  return {
    tbr, fatigueState, fatigueColor, bands, prediction, tbrHistory,
    sessionSec, breakCount, isConnected, participantId, error,
    lastPullAgo, nextPullIn, epochsInWindow,
    tirednessScore, tirednessLabel,
    logBreak, refreshNow,
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPower(v: number): string {
  return v < 0.001 ? `${(v * 1e6).toFixed(1)}e-6` : v.toFixed(4);
}

export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
