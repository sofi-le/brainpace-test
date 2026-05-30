// ─── Types matching Python backend output (realtime_adapter.py) ──────────────

export interface BandPowers {
  delta: number;  // V²/Hz from psd_welch / bandpass_fft
  theta: number;
  alpha: number;
  beta:  number;
  gamma: number;
}

export interface EpochData {
  timestamp: number;
  delta: number;
  theta: number;
  alpha: number;
  beta:  number;
  gamma: number;
  tbr: number;              // theta / beta
  fatigue_state: FatigueState;
  fatigue_color: string;
}

export type FatigueState =
  | 'alert'
  | 'mild_fatigue'
  | 'significant_fatigue'
  | 'severe_fatigue';

export interface Prediction {
  current_tbr: number;
  baseline_tbr: number;
  tbr_vs_baseline: number;
  slope_per_min: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  predicted_severe_in_min: number | null;
  optimal_break_in_min: number | null;
  recommendation: string;
  urgency: 'none' | 'info' | 'warning' | 'critical';
  estimated_retention: number;
  retention_note: string;
}

export interface TBRPoint {
  time: number;       // seconds since the first point in the window
  tbr: number;
  state: FatigueState;
  ts?: string;        // ISO 8601 bucket timestamp (for time-axis labels)
}

export interface SessionStats {
  durationSec: number;
  avgTBR: number;
  maxTBR: number;
  currentTBR: number;
  fatigueState: FatigueState;
  breakCount: number;
  prediction: Prediction | null;
}

export interface StudySession {
  id: string;
  name: string;
  duration: string;
  avgTBR: number;
  breaks: number;
  grade: string;
  gradeColor: string;
  date: string;
}

// WebSocket message types from backend
export interface WSEEGUpdate {
  type: 'eeg_update';
  epoch: EpochData;
  prediction: Prediction;
  session_sec: number;
  break_count: number;
  history_length: number;
}

export interface WSKeepalive {
  type: 'keepalive';
  session_sec: number;
}

export interface WSBreakLogged {
  type: 'break_logged';
  break_count: number;
}

export type WSMessage = WSEEGUpdate | WSKeepalive | WSBreakLogged;
