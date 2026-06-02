# AI support (no USB debugging)

This folder contains an **offline, local-only** “AI-assisted” diagnostic helper for **BSOD / blue / blank / broken-screen** phones **without USB debugging**.

It is intentionally **not a cloud LLM** and does not require Internet. Instead, it combines the signals SmartHub already collects (host USB enumeration + optional webcam screen analysis) into:

- A **ranked diagnosis** (top causes)
- A **confidence score**
- A short **explanation** (“why it thinks that”)

Because **no USB debugging** means we cannot read device logs, this is best-effort and should be used alongside technician judgement.

## ADB diagnostics: offline conclusion (USB debugging enabled)

When the phone is available via ADB, SmartHub can also generate a short **offline AI-style overall conclusion** summarizing the ADB diagnostic categories.

- Script: `AI support/ai_adb_conclude.py`
- Backend endpoint: `POST /ai-adb-conclude` (used by the ADB diagnostic modal)

This helper is also local-only and heuristic-based.

## Inputs

The tool expects JSON from:

- `GET /connection-check?deep=1&samples=30&delayMs=1500`
- `GET /screen-visual-check?samples=30&delayMs=500` (optional)

## Usage

## Prevent accidental edits (lock/protect files)

SmartHub’s BSOD diagnostics are implemented in a few key source files (frontend + offline classifier). To reduce accidental modifications:

- VS Code is configured to open these files as **read-only** via [.vscode/settings.json](.vscode/settings.json).
- You can also set the Windows file attribute to **Read-only** (reversible) using the helper scripts:

  - Protect: `powershell -ExecutionPolicy Bypass -File ".\Bsod tools\protect-bsod-diagnostics.ps1"`
  - Unprotect: `powershell -ExecutionPolicy Bypass -File ".\Bsod tools\unprotect-bsod-diagnostics.ps1"`

### Recommended: run in live mode (no files)

This calls the local SmartHub companion service and performs deep sampling automatically:

`python ".\\AI support\\ai_diagnose.py" --live --pretty`

You can tune timings (slower = more accurate):

`python ".\\AI support\\ai_diagnose.py" --live --usb-samples 30 --usb-delay-ms 1500 --cam-samples 30 --cam-delay-ms 500 --pretty`

### 1) Save the JSON files

From a PowerShell terminal:

- Connection check:

  `Invoke-RestMethod http://localhost:3333/connection-check?deep=1&samples=30&delayMs=1500 | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 connection-check.json`

- Visual check (optional):

  `Invoke-RestMethod http://localhost:3333/screen-visual-check?samples=30&delayMs=500 | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 screen-visual.json`

### 2) Run the AI-assisted diagnosis


  `python ".\AI support\ai_diagnose.py" --connection connection-check.json --visual screen-visual.json`


  `python ".\AI support\ai_diagnose.py" --connection connection-check.json`

Tip: run the command from the SmartHub repo root (same folder as `package.json`).

## Output

The tool prints a small JSON report to stdout, including:

- `top`: the best guess (label + confidence)
- `ranked`: top 3 hypotheses
- `explanations`: key evidence used

## Local offline memory (case history)

The tool can keep a **local/offline memory** of past diagnoses in a small SQLite database:

- Default location (Windows): `%APPDATA%\\SmartHubDiagnostics\\AI\\memory.sqlite`
- Default location (Linux): `~/.local/share/smarthub/ai/memory.sqlite`
- You can override this with: `--memory-db <path>`
- No Internet required; data stays on the technician PC.

### Save a case

Add `--remember` when running:

- Live mode:

  `python ".\\AI support\\ai_diagnose.py" --live --remember --note "Customer reports blue screen" --pretty`

### View history

- List recent cases:

  `python ".\\AI support\\ai_diagnose.py" --list-memory 20`

- Show one case:

  `python ".\\AI support\\ai_diagnose.py" --show-case 12 --pretty`

When memory exists, the diagnosis output also includes a `memory.similar[]` section with a few **similar past cases**.

## Notes / safety boundary

- This tool performs **detection + classification only**.
- It does **not** bypass device security, perform exploitation, raw flashing, or any bootrom handshakes.
- If it detects likely low-level recovery modes (EDL / MTK preloader / DFU), recovery should be done using **authorised OEM** procedures.
