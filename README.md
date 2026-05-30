# BrainPace — integrated app

This repo wires together two upstream projects into one runnable app:

- **`backend/`** — FastAPI EEG service (from [Y0z64/Brainspace](https://github.com/Y0z64/Brainspace)).
  Pulls raw EEG from the AWEAR B2B API and computes band powers, TBR (theta/beta
  ratio), tiredness and mood.
- **`frontend/`** — Expo / React Native app (from [pn-le/Brainpace-Frontend](https://github.com/pn-le/Brainpace-Frontend)).
  The home screen shows the **TBR index**, a **fatigue meter**, and a
  **TBR-over-time** chart with one point every 20 seconds.

The integration work lives only in this repo — the upstream repos are untouched.

## What was wired up

- `frontend/src/api.ts` — client for the backend (`/members`, `/summary/{id}`,
  `/cognition/{id}/series?bucket=20s`).
- `frontend/src/hooks/useEEGStream.ts` — polls the backend every 20s and maps the
  responses into the shape the screens expect (current TBR, fatigue state, band
  powers, 20-second history points, and a client-side prediction).
- `frontend/src/screens/HomeScreen.tsx` — TBR index ring, fatigue meter, and the
  TBR-over-time chart now render live data (was hardcoded).
- `backend/app/main.py` — added CORS so the app can call the API cross-origin.
- `backend/app/services/eeg.py` — caches the cognition timeline so 20s polling
  doesn't re-pull a full window from AWEAR on every tick.

## Run it

### 1. Backend

```bash
cd backend
cp .env.example .env        # then put your AWEAR_API_KEY in .env
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Quick check: `curl http://localhost:8000/members` should list participant ids.

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your backend
npm install
npm run web                 # or: npm run ios / npm run android
```

For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP
(e.g. `http://192.168.1.42:8000`) — `localhost` won't resolve from the device.

## Home screen data flow

```
AWEAR API ──> backend /cognition/{id}/series?bucket=20s ──> useEEGStream ──> HomeScreen
                  (per-second TBR, averaged into 20s buckets)        TBR ring + meter + chart
```

The chart plots every 20-second bucket from the recent window; the ring and
fatigue meter use the most recent bucket. TBR thresholds → fatigue state come
from `frontend/src/theme.ts` (`getTBRLevel`).
