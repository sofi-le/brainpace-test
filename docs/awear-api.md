# AWEAR API Documentation

> B2B EEG research API. De-identified by default — members are exposed as opaque
> participant ids (`P-XXXXXX`), never emails.

## Authentication

All requests require the `Authorization` header with format: `Bearer awr_sk_...`

```bash
curl -H "Authorization: Bearer awr_sk_your_api_key_here" https://awear-b2b-2026.vercel.app/api/v1/members
```

## Base URL

`https://awear-b2b-2026.vercel.app/api/v1`

## Rate Limiting

Limits are per API key, with a 1-hour rolling window.

| Bucket | Limit | Endpoints |
|--------|-------|-----------|
| general | 500 requests/min | members, stats, sessions, compare, usage |
| raw_data | 60 requests/min | data (EEG raw) |

When exceeded, you get `429 Too Many Requests` with a `Retry-After` header.

## Monthly Data Quota (BigQuery)

Every paid request that touches EEG data is metered in **GB scanned** by BigQuery.
Usage is aggregated monthly per group.

| Plan state | Included quota | Overage |
|------|----------------|---------|
| No active plan | 0 GB | `402 NO_PLAN` on any data call |
| Paid (monthly or annual) | 500 GB × active subs | $0.02 per extra GB, capped at $40 / month |

Reset happens at the start of each Stripe billing cycle (monthly for the Monthly
plan, yearly for the Annual plan).

**Hard per-query cap**: every BigQuery job has `maximumBytesBilled = 10 GB`. Queries
scanning more are killed by BQ itself — useful to protect you from accidental
full-scan requests.

When there's no active subscription, the API returns `402 NO_PLAN`. When quota is
exhausted while on a plan, the API returns `429 QUOTA_EXCEEDED`.

## Participant De-identification

The API is **de-identified by default**: members are exposed as opaque participant
ids (e.g. `P-A1B2C3`), never as emails. All endpoints accept and return
`participantId`. The real email is held server-side only and is never exposed to
API-key callers (admin platform tokens are the only exception). The bound
`device_id` is exposed and can be used as a cross-reference to the wearable.

Pass the participant id wherever the docs show `:participantId` (path) or
`participants=` (query). Old `emails=` parameter is accepted for one transition
release but emits a deprecation note in logs.

## Device Binding (Anti-Abuse)

Each paid seat is bound to exactly **one device_id**. When a participant first
records EEG data, the platform detects the `device_id` and the group leader must
approve it via the Billing dashboard. Once bound:

- The API only returns data for the **bound device_id**.
- Any other device tagged with the same participant is ignored (protects against
  multi-device abuse).
- If a slot has a participant but no device bound yet, the API returns
  `403 DEVICE_NOT_BOUND` until the leader confirms the binding.

The leader can change the bound device anytime in `/billing` → Device Binding modal.

## Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | BAD_REQUEST | Missing or invalid parameters |
| 401 | MISSING_AUTH | Missing Authorization header |
| 401 | INVALID_KEY | Invalid or unknown API key |
| 403 | KEY_REVOKED | API key has been revoked |
| 403 | FORBIDDEN | Participant not in your group, or invalid participant id (expected P-XXXXXX) |
| 403 | DEVICE_NOT_BOUND | Member's slot needs a bound device (leader action required) |
| 405 | METHOD_NOT_ALLOWED | HTTP method not supported |
| 409 | CONFLICT | State conflict (e.g., subscription already active) |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit exceeded |
| 402 | NO_PLAN | No active subscription — activate a plan in /billing |
| 429 | QUOTA_EXCEEDED | Monthly GB quota or overage cap reached |
| 500 | INTERNAL_ERROR | Internal server error |

Error response format:

```json
{
  "error": {
    "code": "INVALID_KEY",
    "message": "API key not found."
  }
}
```

---

## Endpoints

### GET /api/v1/members

**Description:** List all active members in your research group.
**Auth:** API Key required | **Rate limit:** general (500/min)

**Example:**

```bash
curl -H "Authorization: Bearer awr_sk_..." https://awear-b2b-2026.vercel.app/api/v1/members
```

**Response:**

```json
{
  "members": [
    {
      "participantId": "P-A1B2C3",
      "status": "active",
      "joinedAt": "2026-01-15T10:30:00.000Z",
      "accessState": "bound",
      "deviceId": "AWR-D001",
      "hasSlot": true
    }
  ],
  "count": 1
}
```

---

### GET /api/v1/members/:participantId/data

**Description:** Fetch raw EEG data for a specific member.
**Auth:** API Key required | **Rate limit:** raw_data (60/min)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start | string (ISO 8601) | **required** | Start timestamp for data window |
| end | string (ISO 8601) | **required** | End timestamp for data window |
| tz | string (IANA) | optional (default: UTC) | Timezone for timestamps (e.g. Europe/Rome) |
| limit | integer | optional (default: 5000) | Max number of records (1-50000) |
| offset | integer | optional (default: 0) | Pagination offset |
| sort | string | optional (default: asc) | Sort by timestamp: "asc" or "desc" |
| format | string | optional (default: json) | "json" or "csv" |

**EEG Channel:** RIGHT_TEMP (TP10 — Right Temporal, 256 samples @ 256Hz per record)

**Example:**

```bash
curl -H "Authorization: Bearer awr_sk_..." \
  "https://awear-b2b-2026.vercel.app/api/v1/members/P-A1B2C3/data?start=2026-03-01T00:00:00Z&end=2026-03-02T00:00:00Z&tz=Europe/Rome&limit=100&format=json"
```

**Response (JSON):**

```json
{
  "data": [
    {
      "timestamp": "2026-03-01T09:15:32.000+01:00",
      "device_id": "AWR-D001",
      "waveform": [0.123, -0.456, 0.789, ...]
    }
  ],
  "pagination": {
    "total": 15420,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  },
  "meta": {
    "participantId": "P-A1B2C3",
    "start": "2026-03-01T00:00:00Z",
    "end": "2026-03-02T00:00:00Z",
    "tz": "Europe/Rome"
  }
}
```

**Response (CSV):** When `format=csv`, returns a downloadable CSV file with columns:
timestamp, participant_id, device_id, s0, s1, ..., s255 (256 sample columns).

---

### GET /api/v1/members/:participantId/stats

**Description:** Get aggregated statistics for a specific member.
**Auth:** API Key required | **Rate limit:** general (500/min)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start | string (ISO 8601) | optional | Filter stats from this date |
| end | string (ISO 8601) | optional | Filter stats until this date |
| tz | string (IANA) | optional (default: UTC) | Timezone for timestamps |

**Example:**

```bash
curl -H "Authorization: Bearer awr_sk_..." \
  "https://awear-b2b-2026.vercel.app/api/v1/members/P-A1B2C3/stats?tz=Europe/Rome"
```

**Response:**

```json
{
  "participantId": "P-A1B2C3",
  "totalSamples": 284510,
  "totalHours": 79.03,
  "firstRecord": "2025-11-20T10:00:00.000+01:00",
  "lastRecord": "2026-03-10T18:45:00.000+01:00",
  "devices": [
    {
      "deviceId": "AWR-D001",
      "sampleCount": 200100,
      "lastUsed": "2026-03-10T18:45:00.000+01:00"
    }
  ]
}
```

---

### GET /api/v1/members/:participantId/sessions

**Description:** List recording sessions for a specific member, grouped by date and device.
**Auth:** API Key required | **Rate limit:** general (500/min)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start | string (ISO 8601) | optional | Filter sessions from this date |
| end | string (ISO 8601) | optional | Filter sessions until this date |
| tz | string (IANA) | optional (default: UTC) | Timezone for timestamps |
| limit | integer | optional (default: 50) | Max number of sessions (1-500) |
| offset | integer | optional (default: 0) | Pagination offset |

**Example:**

```bash
curl -H "Authorization: Bearer awr_sk_..." \
  "https://awear-b2b-2026.vercel.app/api/v1/members/P-A1B2C3/sessions?start=2026-03-01T00:00:00Z&tz=Europe/Rome&limit=20"
```

**Response:**

```json
{
  "sessions": [
    {
      "date": "2026-03-10",
      "deviceId": "AWR-D001",
      "sampleCount": 4320,
      "startTime": "2026-03-10T09:00:00.000+01:00",
      "endTime": "2026-03-10T10:12:00.000+01:00"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 1
  },
  "meta": {
    "participantId": "P-A1B2C3",
    "tz": "Europe/Rome",
    "start": "2026-03-01T00:00:00Z"
  }
}
```

---

### GET /api/v1/usage

**Description:** Check current rate limit usage for your API key.
**Auth:** API Key required | **Rate limit:** none

**Example:**

```bash
curl -H "Authorization: Bearer awr_sk_..." https://awear-b2b-2026.vercel.app/api/v1/usage
```

**Response:**

```json
{
  "keyId": "awr_sk_a1b2c3...",
  "usage": {
    "general": {
      "used": 42,
      "limit": 500,
      "remaining": 458,
      "resetsAt": "2026-03-11T15:00:00.000Z"
    },
    "raw_data": {
      "used": 7,
      "limit": 100,
      "remaining": 93,
      "resetsAt": "2026-03-11T15:00:00.000Z"
    }
  }
}
```

---

### GET /api/v1/compare

**Description:** Compare EEG data across multiple members in the same time window.
**Auth:** API Key required | **Rate limit:** general (500/min)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| participants | string | **required** | Comma-separated list of participant ids (e.g. P-A1B2C3,P-D4E5F6) — 2-10 participants |
| start | string (ISO 8601) | **required** | Start timestamp |
| end | string (ISO 8601) | **required** | End timestamp |
| tz | string (IANA) | optional (default: UTC) | Timezone for timestamps |

**Example:**

```bash
curl -H "Authorization: Bearer awr_sk_..." \
  "https://awear-b2b-2026.vercel.app/api/v1/compare?participants=P-A1B2C3,P-D4E5F6&start=2026-03-01T00:00:00Z&end=2026-03-10T00:00:00Z&tz=Europe/Rome"
```

**Response:**

```json
{
  "stats": [
    {
      "participantId": "P-A1B2C3",
      "totalSamples": 154200,
      "totalHours": 42.83,
      "firstRecord": "2026-03-01T09:00:00.000+01:00",
      "lastRecord": "2026-03-09T18:30:00.000+01:00",
      "avgSamplesPerDay": 17133,
      "activeDays": 9,
      "devices": ["AWR-D001"]
    }
  ],
  "timeline": [
    {
      "date": "2026-03-01",
      "participantId": "P-A1B2C3",
      "sampleCount": 15420
    }
  ],
  "meta": {
    "participants": ["P-A1B2C3", "P-D4E5F6"],
    "start": "2026-03-01T00:00:00Z",
    "end": "2026-03-10T00:00:00Z",
    "tz": "Europe/Rome"
  }
}
```

---

## Python Example

```python
import requests

API_KEY = "awr_sk_your_key_here"
BASE = "https://awear-b2b-2026.vercel.app/api/v1"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# List members
members = requests.get(f"{BASE}/members", headers=HEADERS).json()
print(f"Active members: {members['count']}")

# Download EEG data as CSV (with Rome timezone)
params = {
    "start": "2026-03-01T00:00:00Z",
    "end": "2026-03-02T00:00:00Z",
    "tz": "Europe/Rome",
    "format": "csv"
}
participant_id = members["members"][0]["participantId"]
resp = requests.get(f"{BASE}/members/{participant_id}/data", headers=HEADERS, params=params)

with open("eeg_data.csv", "w") as f:
    f.write(resp.text)
print("Data saved to eeg_data.csv")
```
