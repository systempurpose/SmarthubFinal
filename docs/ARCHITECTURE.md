# SmartHub architecture overview

SmartHub is an offline-first diagnostic workstation tool:

- The **Windows WPF shell** hosts the UI (WebView2)
- The UI talks to a local **Node/Express** companion service (`localhost:3333`)
- The companion service talks to device tools (ADB/Fastboot) and optional Python helpers

## Core goal

Provide technician-friendly diagnostics with **clear evidence**, **honest confidence**, and **no security-bypass claims**.

## Safety boundary (non-negotiable)

- No bypassing lockscreen, encryption, or Android security.
- No remote enabling of Developer Options / USB debugging.
- No exploit workflows.

## Main runtime flow (simplified)

```mermaid
flowchart LR
  Tech[Technician] --> Shell[Windows App (WPF + WebView2)]
  Shell --> UI[HTML/JS UI]
  UI --> API[Companion service :3333]

  API --> ADB[adb.exe (read-only signals)]
  API --> FB[fastboot.exe (devices/getvar)]
  API --> USB[Windows PnP sampling (PowerShell Get-PnpDevice)]
  API --> CAM[Python + OpenCV webcam helper]
  API --> AI[Offline AI helper (Python scoring)]

  ADB --> API
  FB --> API
  USB --> API
  CAM --> API
  AI --> API

  API --> UI
  UI --> Shell
```

## Where things live

### Desktop shell

- `windows-app/` — WPF app that loads the web UI and can receive messages from it.

### UI

- `html/ui.html` — markup (modals, cards, flows)
- `js/ui.js` — orchestration + rendering + calling backend endpoints
- `css/ui.css` — styling

### Companion service

- `src/server.ts` — Express app + route registration + read-only enforcement
- `src/routes/noDebugRoutes.ts` — **USB-only / BSOD** classification + webcam endpoint
- `src/routes/aiRoutes.ts` — offline AI endpoints + accuracy/memory endpoints

### Python helpers

- `bsod-diagnostic/phone_screen_diag.py` — webcam-based screen analysis (blue/dark/normal + hints)
- `AI support/ai_diagnose.py` — offline interpretable scoring model
  - Can save cases to `AI support/memory.sqlite`
  - Can compute measured accuracy from technician-labeled outcomes

## BSOD / No-USB-Debugging flow (what happens)

1) UI calls:
   - `GET /connection-check?deep=1&samples=30&delayMs=1500`
   - Optional technician confirmations: `techSafeMode=1`, `techMode=...`
2) UI optionally calls:
   - `GET /screen-visual-check?samples=30&delayMs=500`
3) UI calls offline AI:
   - `POST /ai-no-debug-suggest` with `{ connection, visual }`
4) UI renders:
   - Primary reason + evidence
   - Offline AI conclusion + next steps

### Closing the accuracy loop (most important design improvement)

A system can’t claim a real accuracy % without ground truth. SmartHub supports a local, offline measurement loop:

- After a repair/confirmation, the technician selects the confirmed outcome and saves it:
  - `POST /ai-no-debug-remember` (stores a case in offline memory; outcome label optional)
- SmartHub computes real measured accuracy from saved labeled cases:
  - `GET /ai-no-debug-metrics`

This allows continuous improvement with regression protection (and avoids guessing).

## Design principles used in the code

- Prefer **evidence-based reasons** over a single label.
- Keep confidence conservative for USB-only cases.
- Use timeouts and best-effort calls so UI stays responsive.
- Keep AI helper interpretable (no cloud dependency).
