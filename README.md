# SmartHub v5 (SmartHubv5)

SmartHub is a **Windows desktop diagnostic tool** for Android phones. It is built as a **WPF shell (WebView2)** hosting a local **HTML/JS UI**, backed by a local **Node/Express + TypeScript** companion service.

A major feature area is **No-USB-Debugging / USB-only triage** for **blue / blank / broken-screen** phones (“BSOD-style” symptoms), enhanced by optional **webcam-based screen analysis** and an **offline local-only AI helper**.

## High-level components

- **Windows desktop shell**: `windows-app/` (WPF + WebView2)
- **UI (HTML/JS/CSS)**: `html/ui.html`, `js/ui.js`, `css/ui.css`
- **Companion service (Node/Express)**: `src/server.ts` and `src/routes/*`
- **No-debug / BSOD diagnostics**:
  - Backend heuristics: `src/routes/noDebugRoutes.ts` (`GET /connection-check`, `GET /screen-visual-check`)
  - Camera helper: `bsod-diagnostic/phone_screen_diag.py`
  - Offline AI helper: `AI support/ai_diagnose.py`

## Quick start (developer)

### 1) Install Node dependencies

- `npm install`

### 2) Run the companion service

- `npm run dev`

The service listens on `http://localhost:3333`.

### 3) Run the desktop app

Open `SmartHubSystem.sln` and start the Windows app project (WPF shell). The shell loads the local UI and talks to the companion service.

## Login auth setup (Supabase)

SmartHub now supports a login gate with offline reuse after first successful online sign-in.

1. Copy `supabase.local.json.example` to `supabase.local.json` in the workspace root.
2. Put your Supabase values in that file:

```json
{
  "SMARTHUB_SUPABASE_URL": "https://YOUR_PROJECT_REF.supabase.co",
  "SMARTHUB_SUPABASE_ANON_KEY": "YOUR_SUPABASE_ANON_KEY",
  "SMARTHUB_SUPABASE_SERVICE_ROLE_KEY": "YOUR_SUPABASE_SERVICE_ROLE_KEY",
  "SMARTHUB_SUPABASE_EMAIL_REDIRECT_URL": "https://YOUR_RENDER_SERVICE.onrender.com/email-confirmation",
  "SMARTHUB_SUPABASE_DIAGNOSTIC_TABLE": "diagnostic_runs"
}
```

3. Restart the Windows app so it forwards these values to the backend process.

Notes:
- The local file `supabase.local.json` is git-ignored.
- First sign-in requires internet.
- After sign-in, SmartHub stores a local offline session token and can open offline until the session expires.
- Default offline validity is 30 days (configurable via `SMARTHUB_AUTH_OFFLINE_DAYS`).

### Optional: per-user cloud diagnostics history

SmartHub can mirror diagnostic results to Supabase so each logged-in user only sees their own runs.

1. Create table `diagnostic_runs` in Supabase (SQL file: `website/database/supabase/diagnostic_runs.sql`).
2. Put `SMARTHUB_SUPABASE_SERVICE_ROLE_KEY` in `supabase.local.json`.
3. Restart SmartHub.

Cloud save behavior:
- Writes include `owner_user_id` from the signed-in user.
- Reads for `/history/:id` are filtered by that same owner.
- Local file history remains as fallback when offline or if cloud save fails.

## Key endpoints (localhost:3333)

- `GET /connection-check`
  - Auto-test (technician-ready verdict): `GET /connection-check?autoTest=1`
    - `autoTest=1` forces `deep=1` and returns `autoTest: { verdict, confidence, reasons, nextActions, checks }`
  - With deep sampling: `GET /connection-check?deep=1&samples=30&delayMs=1500`
    - Optional ADB stability sampling: `adbSamples=<2..12>` and `adbDelayMs=<0..1200>`
  - Optional technician confirmations:
    - `techSafeMode=1` (Safe Mode improves)
    - `techMode=<fastboot|recovery|download|edl|mtk_preloader|dfu|normal>`
- `GET /screen-visual-check?samples=30&delayMs=500` (optional webcam helper)
- `POST /ai-no-debug-suggest` (offline AI conclusion)
- `POST /ai-no-debug-remember` (save a case to offline AI memory; optional labeled outcome for accuracy measurement)
- `GET /ai-no-debug-metrics?lookback=2000` (measured accuracy from saved cases)

## Where to read more

- System map + architecture: `docs/README.md`
- No-debug/BSOD workflow details: `no-debug-diagnostic/README.md`
- Offline AI helper usage + memory: `AI support/README.md`
- BSOD plan artifacts / test matrix: `docs/bsod-plan/README.md` and `bsodscanhelp/test-matrix.md`
