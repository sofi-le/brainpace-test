/**
 * api.ts — thin client for the Brainspace FastAPI backend.
 *
 * Endpoints used (see backend/app/api/routes):
 *   GET /members                      → { participants: string[] }
 *   GET /summary/{id}                 → current band powers + cognition ratios
 *   GET /cognition/{id}/series         → TBR-over-time points (bucketed)
 *
 * Configure the server location with the EXPO_PUBLIC_API_URL env var
 * (e.g. EXPO_PUBLIC_API_URL=http://192.168.1.42:8000 for a phone on your LAN).
 * Falls back to localhost:8000 for the web preview / simulator.
 */

// ─── Config ──────────────────────────────────────────────────────────────────
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
).replace(/\/$/, '');

// Optional: pin a participant id. If unset, the app uses the first bound member.
export const PARTICIPANT_ID = process.env.EXPO_PUBLIC_PARTICIPANT_ID ?? '';

// Device timezone so "today" lines up with the user's day.
export const TZ =
  Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? 'UTC';

// TBR-over-time chart: window width and resolution. 20s buckets = the
// per-20-second points the home chart plots. The window must be wide enough to
// reach the most recent EEG the backend can serve — AWEAR lags ~5 min and a
// session's data can sit further back, so a narrow trailing window may miss it.
export const SERIES_MINUTES = Number(process.env.EXPO_PUBLIC_SERIES_MINUTES) || 720;
export const SERIES_BUCKET = '20s';

// ─── Backend response shapes (mirror app/models/schemas.py) ────────────────────
export interface BackendBandPowers {
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface CognitionPoint {
  timestamp: string; // ISO 8601, bucket start
  samples: number;
  ratios: Record<string, number>; // { tbr, cognitive_state }
  band_powers: BackendBandPowers;
}

export interface CognitionSeries {
  participant_id: string;
  records: number;
  bucket_seconds: number;
  delay_seconds: number;
  ratios: string[];
  points: CognitionPoint[];
}

export interface SummaryResponse {
  participant_id: string;
  records: number;
  band_powers: BackendBandPowers;
  mood: { valence: number; arousal: number; label: string };
  tiredness: { score: number; index: number; label: string };
  cognition: Record<string, number>;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────
async function getJSON<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`${resp.status} ${path} ${body.slice(0, 200)}`);
  }
  return (await resp.json()) as T;
}

export async function fetchParticipants(): Promise<string[]> {
  const data = await getJSON<{ participants: string[] }>('/members');
  return data.participants ?? [];
}

export async function fetchSummary(id: string): Promise<SummaryResponse> {
  return getJSON<SummaryResponse>(
    `/summary/${encodeURIComponent(id)}?tz=${encodeURIComponent(TZ)}`,
  );
}

export async function fetchCognitionSeries(
  id: string,
  minutes = SERIES_MINUTES,
  bucket = SERIES_BUCKET,
): Promise<CognitionSeries> {
  const qs = `minutes=${minutes}&bucket=${encodeURIComponent(
    bucket,
  )}&tz=${encodeURIComponent(TZ)}`;
  return getJSON<CognitionSeries>(
    `/cognition/${encodeURIComponent(id)}/series?${qs}`,
  );
}

/** Resolve the participant to display: configured id, else first bound member. */
export async function resolveParticipantId(): Promise<string | null> {
  if (PARTICIPANT_ID) return PARTICIPANT_ID;
  const participants = await fetchParticipants();
  return participants.length > 0 ? participants[0] : null;
}
